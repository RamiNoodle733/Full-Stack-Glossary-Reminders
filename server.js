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
        let uri = process.env.MONGO_URI;
        
        // If running locally and no external MongoDB is available, use in-memory MongoDB
        if (!uri.includes('mongodb+srv') && process.env.NODE_ENV !== 'production') {
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
        console.error('Could not connect to MongoDB', err);
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
    checkIns: {
        morning: { type: Date, default: null },
        afternoon: { type: Date, default: null },
        evening: { type: Date, default: null },
    },
    achievements: {
        firstCheckIn: { earned: { type: Boolean, default: false }, date: Date },
        streakThree: { earned: { type: Boolean, default: false }, date: Date },
        streakSeven: { earned: { type: Boolean, default: false }, date: Date },
        streakThirty: { earned: { type: Boolean, default: false }, date: Date },
        knowledgeSeeker: { earned: { type: Boolean, default: false }, date: Date },
        knowledgeMaster: { earned: { type: Boolean, default: false }, date: Date },
        allDayLearner: { earned: { type: Boolean, default: false }, date: Date }
    }
});

const User = mongoose.model('User', UserSchema);

// Define Word schema and model for storing selected words
const WordSchema = new mongoose.Schema({
    interval: { type: String, required: true }, // 'morning', 'afternoon', 'evening'
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

        const currentTime = new Date();
        let currentInterval;

        if (currentTime.getHours() >= 4 && currentTime.getHours() < 12) {
            currentInterval = 'morning';
        } else if (currentTime.getHours() >= 12 && currentTime.getHours() < 20) {
            currentInterval = 'afternoon';
        } else {
            currentInterval = 'evening';
        }

        const lastCheckIn = user.lastCheckIn ? new Date(user.lastCheckIn) : null;
        const sameDay = lastCheckIn && lastCheckIn.toDateString() === currentTime.toDateString();
        const earnedAchievements = [];

        if (!user.checkIns[currentInterval] || new Date(user.checkIns[currentInterval]).getDate() !== currentTime.getDate()) {
            user.checkIns[currentInterval] = currentTime;
            
            if (!sameDay) {
                user.streak++;
                user.multiplier = Math.min(15, user.multiplier * 1.2); // Cap multiplier at 15
            }
            
            user.knowledgePoints += user.multiplier;
            user.lastCheckIn = currentTime;
            
            // Check for achievements
            
            // First check-in achievement
            if (!user.achievements.firstCheckIn.earned) {
                user.achievements.firstCheckIn.earned = true;
                user.achievements.firstCheckIn.date = currentTime;
                earnedAchievements.push('First Check-In');
            }
            
            // Streak achievements
            if (user.streak >= 3 && !user.achievements.streakThree.earned) {
                user.achievements.streakThree.earned = true;
                user.achievements.streakThree.date = currentTime;
                earnedAchievements.push('3-Day Streak');
            }
            
            if (user.streak >= 7 && !user.achievements.streakSeven.earned) {
                user.achievements.streakSeven.earned = true;
                user.achievements.streakSeven.date = currentTime;
                earnedAchievements.push('7-Day Streak');
            }
            
            if (user.streak >= 30 && !user.achievements.streakThirty.earned) {
                user.achievements.streakThirty.earned = true;
                user.achievements.streakThirty.date = currentTime;
                earnedAchievements.push('30-Day Streak');
            }
            
            // Knowledge points achievements
            if (user.knowledgePoints >= 10 && !user.achievements.knowledgeSeeker.earned) {
                user.achievements.knowledgeSeeker.earned = true;
                user.achievements.knowledgeSeeker.date = currentTime;
                earnedAchievements.push('Knowledge Seeker');
            }
            
            if (user.knowledgePoints >= 50 && !user.achievements.knowledgeMaster.earned) {
                user.achievements.knowledgeMaster.earned = true;
                user.achievements.knowledgeMaster.date = currentTime;
                earnedAchievements.push('Knowledge Master');
            }
            
            // Check if user has checked in for all intervals today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            const morningToday = user.checkIns.morning && new Date(user.checkIns.morning) >= today && new Date(user.checkIns.morning) < tomorrow;
            const afternoonToday = user.checkIns.afternoon && new Date(user.checkIns.afternoon) >= today && new Date(user.checkIns.afternoon) < tomorrow;
            const eveningToday = user.checkIns.evening && new Date(user.checkIns.evening) >= today && new Date(user.checkIns.evening) < tomorrow;
            
            if (morningToday && afternoonToday && eveningToday && !user.achievements.allDayLearner.earned) {
                user.achievements.allDayLearner.earned = true;
                user.achievements.allDayLearner.date = currentTime;
                earnedAchievements.push('All-Day Learner');
                
                // Bonus points for completing all intervals
                user.knowledgePoints += 5;
            }
            
            await user.save();
            return res.json({ status: 'ok', points: user.knowledgePoints, newAchievements: earnedAchievements });
        } else {
            return res.json({ status: 'error', error: 'Already checked in for this interval' });
        }
    } catch (error) {
        return res.json({ status: 'error', error: 'Invalid token' });
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

// Fetch or generate word for interval route - Modified to return the same word for all users
app.get('/word-for-interval', async (req, res) => {
    try {
        const currentTime = new Date();
        let currentInterval;

        if (currentTime.getHours() >= 4 && currentTime.getHours() < 12) {
            currentInterval = 'morning';
        } else if (currentTime.getHours() >= 12 && currentTime.getHours() < 20) {
            currentInterval = 'afternoon';
        } else {
            currentInterval = 'evening';
        }

        // Get current date without time for consistency
        const today = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate());
        
        // Try to find an existing word for today's interval
        let wordForInterval = await Word.findOne({
            interval: currentInterval,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        // If no word exists for today's interval, create one
        if (!wordForInterval) {
            console.log(`Creating new word for ${currentInterval} on ${today}`);
            const allWords = Object.keys(glossary);
            
            // Get recently used words to avoid repetition
            const recentWords = await Word.find({})
                .sort({ date: -1 })
                .limit(allWords.length > 20 ? 20 : Math.floor(allWords.length / 2))
                .select('word');
            
            const recentWordsArray = recentWords.map(w => w.word);
            
            // Filter out recently used words
            const availableWords = allWords.filter(word => !recentWordsArray.includes(word));
            
            // If all words have been recently used, just use all words
            const wordsToChooseFrom = availableWords.length > 0 ? availableWords : allWords;
            
            // Select a random word
            const randomIndex = Math.floor(Math.random() * wordsToChooseFrom.length);
            const selectedWord = wordsToChooseFrom[randomIndex];

            // Create and save the new word
            wordForInterval = new Word({
                interval: currentInterval,
                date: today,
                word: selectedWord
            });
            
            await wordForInterval.save();
            console.log(`Saved new word "${selectedWord}" for ${currentInterval}`);
        }

        res.json({ 
            status: 'ok', 
            word: wordForInterval.word,
            meaning: glossary[wordForInterval.word] || "Definition not found"
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

        const currentTime = new Date();
        let currentInterval;

        if (currentTime.getHours() >= 4 && currentTime.getHours() < 12) {
            currentInterval = 'morning';
        } else if (currentTime.getHours() >= 12 && currentTime.getHours() < 20) {
            currentInterval = 'afternoon';
        } else {
            currentInterval = 'evening';
        }

        if (!user.checkIns[currentInterval] || new Date(user.checkIns[currentInterval]).getDate() !== currentTime.getDate()) {
            return res.json({ status: 'ok' });
        } else {
            return res.json({ status: 'error', error: 'Already checked in for this interval' });
        }
    } catch (error) {
        return res.json({ status: 'error', error: 'Invalid token' });
    }
});

// Search glossary route
app.get('/search-glossary', async (req, res) => {
    try {
        const searchTerm = req.query.term.toLowerCase();
        if (!searchTerm || searchTerm.length < 2) {
            return res.json({ status: 'error', error: 'Search term too short' });
        }
        
        const results = {};
        
        // Search for terms in the glossary
        Object.entries(glossary).forEach(([key, value]) => {
            if (key.toLowerCase().includes(searchTerm) || value.toLowerCase().includes(searchTerm)) {
                results[key] = value;
            }
        });
        
        res.json({ status: 'ok', results });
    } catch (error) {
        console.error('Error in search:', error);
        res.status(500).json({ status: 'error', error: 'Search failed' });
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
                name: "Knowledge Seeker",
                description: "Earned 10 knowledge points",
                icon: "fa-book",
                earned: user.achievements.knowledgeSeeker.earned,
                date: user.achievements.knowledgeSeeker.date
            },
            knowledgeMaster: {
                name: "Knowledge Master",
                description: "Earned 50 knowledge points",
                icon: "fa-graduation-cap",
                earned: user.achievements.knowledgeMaster.earned,
                date: user.achievements.knowledgeMaster.date
            },
            allDayLearner: {
                name: "All-Day Learner",
                description: "Checked in during all three intervals in a single day",
                icon: "fa-clock",
                earned: user.achievements.allDayLearner.earned,
                date: user.achievements.allDayLearner.date
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
