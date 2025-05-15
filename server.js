const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Load environment variables

// For in-memory MongoDB when testing locally
const { MongoMemoryServer } = require('mongodb-memory-server');

// Initialize express app
const app = express();
app.use(cors({
    origin: ['https://islamic-glossary-reminders.onrender.com', 'http://localhost:3000', '*'], // Support multiple origins
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());

// Connect to MongoDB - either local, Atlas, or in-memory
async function connectToDatabase() {
    try {
        let uri = process.env.MONGO_URI || 'mongodb://localhost:27017/glossary';
        
        // If no external MongoDB is available, use in-memory MongoDB
        if (!uri || (!uri.includes('mongodb+srv') && process.env.NODE_ENV !== 'production')) {
            console.log('Starting in-memory MongoDB server for local development');
            const mongoServer = await MongoMemoryServer.create();
            uri = mongoServer.getUri();
            console.log(`In-memory MongoDB running at ${uri}`);
        }

        await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Could not connect to MongoDB:', err);
        process.exit(1);
    }
}

// Connect to database before starting the server
connectToDatabase();

// Define User schema and model
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    knowledgePoints: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    multiplier: { type: Number, default: 1 },
    lastCheckIn: { type: Date, default: null },
    achievements: {
        firstCheckIn: { earned: { type: Boolean, default: false }, date: Date },
        streakThree: { earned: { type: Boolean, default: false }, date: Date },
        streakSeven: { earned: { type: Boolean, default: false }, date: Date },
        streakThirty: { earned: { type: Boolean, default: false }, date: Date },
        knowledgeSeeker: { earned: { type: Boolean, default: false }, date: Date },
        knowledgeMaster: { earned: { type: Boolean, default: false }, date: Date }
    }
});

const User = mongoose.model('User', UserSchema);

// Define Word schema and model for storing selected words
const WordSchema = new mongoose.Schema({
    interval: { type: String, required: true }, // 'daily'
    date: { type: Date, required: true },
    word: { type: String, required: true }
});

// Create a compound index to ensure uniqueness of interval+date combination
WordSchema.index({ interval: 1, date: 1 }, { unique: true });

const Word = mongoose.model('Word', WordSchema);

// Load glossary from JSON file
let glossary = {};
try {
    const glossaryPath = path.join(__dirname, 'public', 'glossary.json');
    const glossaryContent = fs.readFileSync(glossaryPath, 'utf8');
    glossary = JSON.parse(glossaryContent);
    console.log('Glossary loaded successfully with', Object.keys(glossary).length, 'words');
} catch (error) {
    console.error('Error loading glossary:', error);
}

// Serve the static files from the "public" directory
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Helper function to determine the current check-in period
function getCurrentPeriod() {
    // Convert current time to CDT (UTC-5)
    const now = new Date();
    const utcHour = now.getUTCHours();
    const cdtHour = (utcHour - 5 + 24) % 24; // Convert to CDT

    // Define check-in periods in CDT
    if (cdtHour >= 20 || cdtHour < 6) {
        return 'night'; // 8:00 PM - 6:00 AM
    } else if (cdtHour >= 6 && cdtHour < 15) {
        return 'morning'; // 6:00 AM - 3:00 PM
    } else {
        return 'afternoon'; // 3:00 PM - 8:00 PM
    }
}

// Helper function to get the start and end time of the current period
function getPeriodTimes(period = getCurrentPeriod()) {
    const now = new Date();
    const startTime = new Date(now);
    const endTime = new Date(now);
    const utcHour = now.getUTCHours();
    
    // Set to current day's respective period times
    switch (period) {
        case 'night':
            if (utcHour < 11) { // Before 6 AM CDT
                // Night period from previous day
                startTime.setDate(startTime.getDate() - 1);
                startTime.setUTCHours(1, 0, 0, 0); // 8 PM CDT previous day
                endTime.setUTCHours(11, 0, 0, 0); // 6 AM CDT today
            } else {
                // Night period starts today
                startTime.setUTCHours(1, 0, 0, 0); // 8 PM CDT today
                endTime.setDate(endTime.getDate() + 1);
                endTime.setUTCHours(11, 0, 0, 0); // 6 AM CDT tomorrow
            }
            break;
        case 'morning':
            startTime.setUTCHours(11, 0, 0, 0); // 6 AM CDT
            endTime.setUTCHours(20, 0, 0, 0); // 3 PM CDT
            break;
        case 'afternoon':
            startTime.setUTCHours(20, 0, 0, 0); // 3 PM CDT
            if (utcHour < 1) {
                startTime.setDate(startTime.getDate() - 1);
            }
            endTime.setUTCHours(1, 0, 0, 0); // 8 PM CDT
            if (utcHour >= 1) {
                endTime.setDate(endTime.getDate() + 1);
            }
            break;
    }

    return { startTime, endTime };
}

// Helper function to check if a word exists for the current period
async function getWordForCurrentPeriod() {
    const currentPeriod = getCurrentPeriod();
    const { startTime, endTime } = getPeriodTimes(currentPeriod);
    
    // Try to find an existing word for the current period
    let existingWord = await Word.findOne({
        interval: currentPeriod,
        date: {
            $gte: startTime,
            $lte: endTime
        }
    });

    if (existingWord) {
        return existingWord;
    }

    // If no word exists for the current period, create a new one
    const allWords = Object.keys(glossary);
    
    // Get recently used words
    const recentWords = await Word.find({})
        .sort({ date: -1 })
        .limit(10)
        .select('word');

    const recentWordsArray = recentWords.map(w => w.word);
    const availableWords = allWords.filter(word => !recentWordsArray.includes(word));
    const wordsToChooseFrom = availableWords.length > 0 ? availableWords : allWords;
    
    const randomIndex = Math.floor(Math.random() * wordsToChooseFrom.length);
    const selectedWord = wordsToChooseFrom[randomIndex];

    existingWord = new Word({
        interval: currentPeriod,
        date: startTime, // Use period start time for consistency
        word: selectedWord
    });

    await existingWord.save();
    return existingWord;
}

// Signup route
app.post('/signup', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const user = await User.create({ username, password: hashedPassword });
        res.json({ status: 'ok', user });
    } catch (err) {
        res.json({ status: 'error', error: 'Duplicate username' });
    }
});

// Login route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
        return res.json({ status: 'error', error: 'Invalid login' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (isPasswordValid) {
        const token = jwt.sign({ username: user.username }, 'secret123');
        return res.json({ status: 'ok', token });
    } else {
        return res.json({ status: 'error', error: 'Invalid login' });
    }
});

// Update knowledge points route
app.post('/update-points', async (req, res) => {
    const token = req.headers['x-access-token'];
    try {
        const decoded = jwt.verify(token, 'secret123');
        const username = decoded.username;
        const user = await User.findOne({ username });

        const currentPeriod = getCurrentPeriod();
        const { startTime, endTime } = getPeriodTimes();
        const lastCheckIn = user.lastCheckIn ? new Date(user.lastCheckIn) : null;

        // Get the current word for this period
        const currentWord = await Word.findOne({
            interval: currentPeriod,
            date: {
                $gte: startTime,
                $lt: endTime
            }
        });

        if (!currentWord) {
            return res.json({ 
                status: 'error', 
                error: 'No word available for current period',
                points: user.knowledgePoints,
                streak: user.streak,
                multiplier: user.multiplier
            });
        }

        // Check if already checked in for this period
        if (lastCheckIn && lastCheckIn >= startTime && lastCheckIn < endTime) {
            return res.json({ 
                status: 'error', 
                error: 'Already checked in for this period',
                points: user.knowledgePoints,
                streak: user.streak,
                multiplier: user.multiplier
            });
        }

        // Handle streak and multiplier logic
        if (!lastCheckIn) {
            // First check-in ever
            user.streak = 1;
            user.multiplier = 1;
        } else {
            // Get the previous period's start time
            const prevPeriodEnd = startTime;
            const prevPeriodStart = new Date(prevPeriodEnd);
            switch (currentPeriod) {
                case 'night':
                    prevPeriodStart.setHours(prevPeriodStart.getHours() - 5); // 3PM - 8PM
                    break;
                case 'morning':
                    prevPeriodStart.setHours(prevPeriodStart.getHours() - 10); // 8PM - 6AM
                    break;
                case 'afternoon':
                    prevPeriodStart.setHours(prevPeriodStart.getHours() - 9); // 6AM - 3PM
                    break;
            }

            // Check if they checked in during the previous period
            if (lastCheckIn >= prevPeriodStart && lastCheckIn < prevPeriodEnd) {
                // Checked in during previous period - increment streak
                user.streak++;
                user.multiplier = Math.min(15, Math.round(user.multiplier * 1.2 * 1000) / 1000);
            } else {
                // Missed the previous period - reset streak
                user.streak = 1;
                user.multiplier = 1;
            }
        }

        // Calculate and update points
        const pointsEarned = Math.round(user.multiplier * 1000) / 1000;
        user.knowledgePoints = Math.round((user.knowledgePoints + pointsEarned) * 1000) / 1000;
        user.lastCheckIn = new Date();

        // Achievement checking logic
        const earnedAchievements = [];
        
        if (!user.achievements.firstCheckIn.earned) {
            user.achievements.firstCheckIn.earned = true;
            user.achievements.firstCheckIn.date = new Date();
            earnedAchievements.push('First Check-In');
        }
        
        if (user.streak >= 3 && !user.achievements.streakThree.earned) {
            user.achievements.streakThree.earned = true;
            user.achievements.streakThree.date = new Date();
            earnedAchievements.push('3-Day Streak');
        }
        
        if (user.streak >= 7 && !user.achievements.streakSeven.earned) {
            user.achievements.streakSeven.earned = true;
            user.achievements.streakSeven.date = new Date();
            earnedAchievements.push('7-Day Streak');
        }
        
        if (user.streak >= 30 && !user.achievements.streakThirty.earned) {
            user.achievements.streakThirty.earned = true;
            user.achievements.streakThirty.date = new Date();
            earnedAchievements.push('30-Day Streak');
        }
        
        if (user.knowledgePoints >= 10 && !user.achievements.knowledgeSeeker.earned) {
            user.achievements.knowledgeSeeker.earned = true;
            user.achievements.knowledgeSeeker.date = new Date();
            earnedAchievements.push('Taalib \'Ilm (طالب العلم)');
        }
        
        if (user.knowledgePoints >= 50 && !user.achievements.knowledgeMaster.earned) {
            user.achievements.knowledgeMaster.earned = true;
            user.achievements.knowledgeMaster.date = new Date();
            earnedAchievements.push('\'Aalim (عالم)');
        }

        await user.save();
        return res.json({ 
            status: 'ok', 
            points: user.knowledgePoints,
            streak: user.streak,
            multiplier: user.multiplier,
            pointsEarned,
            newAchievements: earnedAchievements
        });
    } catch (error) {
        console.error('Error in update-points:', error);
        return res.json({ status: 'error', error: 'Failed to update points' });
    }
});

// Get user stats route
app.get('/user-stats', async (req, res) => {
    const token = req.headers['x-access-token'];
    try {
        const decoded = jwt.verify(token, 'secret123');
        const user = await User.findOne({ username: decoded.username });
        res.json({ status: 'ok', points: user.knowledgePoints, streak: user.streak, multiplier: user.multiplier });
    } catch (error) {
        res.json({ status: 'error', error: 'Failed to fetch stats' });
    }
});

// Fetch or generate word for interval route
app.get('/word-for-interval', async (req, res) => {
    try {
        const wordForInterval = await getWordForCurrentPeriod();        // Handle different possible formats of the glossary data
        let meaning = "Definition not found";
        let arabic = "";
        
        const wordData = glossary[wordForInterval.word];
        if (wordData) {
            if (typeof wordData === 'string') {
                // Handle old format where wordData is just the definition string
                meaning = wordData;
            } else if (typeof wordData === 'object') {
                // Handle new format where wordData is an object with definition and arabic
                meaning = wordData.definition || "Definition not found";
                arabic = wordData.arabic || "";
            }
        }
        
        res.json({ 
            status: 'ok', 
            word: wordForInterval.word,
            meaning: meaning,
            arabic: arabic,
            period: getCurrentPeriod(),
            nextUpdate: getPeriodTimes().endTime
        });
    } catch (error) {
        console.error('Error in word-for-interval:', error);
        res.status(500).json({ status: 'error', error: 'Failed to retrieve word' });
    }
});

// Leaderboard route
app.get('/leaderboard', async (req, res) => {
    try {
        const users = await User.find().sort({ knowledgePoints: -1 }).limit(10); // Top 10 users
        res.json({ status: 'ok', users });
    } catch (error) {
        res.json({ status: 'error', error: 'Failed to fetch leaderboard' });
    }
});

// Check if user can check in
app.get('/can-check-in', async (req, res) => {
    const token = req.headers['x-access-token'];
    try {
        const decoded = jwt.verify(token, 'secret123');
        const username = decoded.username;
        const user = await User.findOne({ username });

        if (!user) {
            return res.json({ 
                status: 'error', 
                error: 'User not found',
                points: 0,
                streak: 0,
                multiplier: 1
            });
        }

        const currentPeriod = getCurrentPeriod();
        const { startTime, endTime } = getPeriodTimes(currentPeriod);
        const lastCheckIn = user.lastCheckIn ? new Date(user.lastCheckIn) : null;

        // Check if user has already checked in for this period
        if (lastCheckIn && lastCheckIn >= startTime && lastCheckIn <= endTime) {
            return res.json({ 
                status: 'error', 
                error: 'Already checked in for this period',
                points: user.knowledgePoints,
                streak: user.streak,
                multiplier: user.multiplier
            });
        }

        // Get the current word for this period
        const currentWord = await Word.findOne({
            interval: currentPeriod,
            date: {
                $gte: startTime,
                $lte: endTime
            }
        });

        if (!currentWord) {
            return res.json({ 
                status: 'error',
                error: 'No word available for current period',
                points: user.knowledgePoints,
                streak: user.streak,
                multiplier: user.multiplier
            });
        }

        // User can check in
        return res.json({ 
            status: 'ok',
            points: user.knowledgePoints,
            streak: user.streak,
            multiplier: user.multiplier
        });
    } catch (error) {
        console.error('Error in can-check-in:', error);
        return res.json({ 
            status: 'error', 
            error: 'Invalid token',
            points: 0,
            streak: 0,
            multiplier: 1
        });
    }
});

// Word history route
app.get('/word-history', async (req, res) => {
    try {
        const token = req.headers['x-access-token'];
        if (!token) {
            return res.status(401).json({ status: 'error', error: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, 'secret123');
        
        // Find recent words (last 10)
        const recentWords = await Word.find({})
            .sort({ date: -1 })
            .limit(10)
            .select('word interval date');
            
        const formattedHistory = recentWords.map(entry => ({
            word: entry.word,
            meaning: glossary[entry.word] || "Definition not available",
            interval: entry.interval,
            date: entry.date
        }));
        
        res.json({ status: 'ok', history: formattedHistory });
    } catch (error) {
        console.error('Error fetching word history:', error);
        res.status(500).json({ status: 'error', error: 'Failed to fetch word history' });
    }
});

// Get user achievements
app.get('/achievements', async (req, res) => {
    const token = req.headers['x-access-token'];
    try {
        const decoded = jwt.verify(token, 'secret123');
        const user = await User.findOne({ username: decoded.username });
        
        const achievements = {
            firstCheckIn: {
                name: "First Check-In",
                description: "Checked in for the first time",
                icon: "fa-award",
                earned: user.achievements.firstCheckIn.earned,
                date: user.achievements.firstCheckIn.date
            },
            streakThree: {
                name: "3-Day Streak",
                description: "Maintained a 3-day streak",
                icon: "fa-fire",
                earned: user.achievements.streakThree.earned,
                date: user.achievements.streakThree.date
            },
            streakSeven: {
                name: "7-Day Streak",
                description: "Maintained a 7-day streak",
                icon: "fa-fire",
                earned: user.achievements.streakSeven.earned,
                date: user.achievements.streakSeven.date
            },
            streakThirty: {
                name: "30-Day Streak",
                description: "Maintained a 30-day streak",
                icon: "fa-crown",
                earned: user.achievements.streakThirty.earned,
                date: user.achievements.streakThirty.date
            },
            knowledgeSeeker: {
                name: "Taalib 'Ilm (طالب العلم)",
                description: "Earned 10 knowledge points",
                icon: "fa-book",
                earned: user.achievements.knowledgeSeeker.earned,
                date: user.achievements.knowledgeSeeker.date
            },
            knowledgeMaster: {
                name: "'Aalim (عالم)",
                description: "Earned 50 knowledge points",
                icon: "fa-graduation-cap",
                earned: user.achievements.knowledgeMaster.earned,
                date: user.achievements.knowledgeMaster.date
            }
        };
        
        res.json({ status: 'ok', achievements });
    } catch (error) {
        res.json({ status: 'error', error: 'Failed to fetch achievements' });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
