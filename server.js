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
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 3000; // 3 seconds
    
    const connectWithRetry = async () => {
        try {
            let uri = process.env.MONGO_URI || 'mongodb://localhost:27017/glossary';
            
            console.log('Environment:', process.env.NODE_ENV);
            console.log('MONGO_URI available:', !!process.env.MONGO_URI);
            console.log('Connect attempt:', retryCount + 1);
            
            // If no external MongoDB is available, use in-memory MongoDB
            if (!uri || (!uri.includes('mongodb+srv') && process.env.NODE_ENV !== 'production')) {
                console.log('Starting in-memory MongoDB server for local development');
                try {
                    const mongoServer = await MongoMemoryServer.create();
                    uri = mongoServer.getUri();
                    console.log(`In-memory MongoDB running at ${uri}`);
                } catch (memDbErr) {
                    console.error('Error starting in-memory MongoDB:', memDbErr.message);
                    uri = 'mongodb://localhost:27017/glossary'; // Fallback to local MongoDB
                }
            } else {
                console.log('Using external MongoDB instance');
            }

            // Set connection options
            const mongooseOptions = {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000, // 5 seconds
                socketTimeoutMS: 45000, // 45 seconds
                connectTimeoutMS: 10000, // 10 seconds
                family: 4 // Force IPv4
            };

            // Close existing connection if any
            if (mongoose.connection.readyState) {
                console.log('Closing existing mongoose connection');
                await mongoose.connection.close();
            }

            await mongoose.connect(uri, mongooseOptions);
            console.log('Connected to MongoDB successfully');
            
            // Check if connection actually worked
            if (mongoose.connection.readyState === 1) {  // 1 = connected
                console.log('MongoDB connection verified: Connected');
                
                // Test if we can access the collections
                try {
                    const collections = await mongoose.connection.db.collections();
                    console.log(`Available collections: ${collections.map(c => c.collectionName).join(', ')}`);
                    
                    // Setup connection monitoring
                    mongoose.connection.on('error', (error) => {
                        console.error('MongoDB connection error:', error);
                        if (!mongoose.connection.readyState) {
                            console.log('Connection lost, attempting to reconnect...');
                            setTimeout(connectWithRetry, retryDelay);
                        }
                    });
                    
                    mongoose.connection.on('disconnected', () => {
                        console.log('MongoDB disconnected, attempting to reconnect...');
                        setTimeout(connectWithRetry, retryDelay);
                    });
                    
                    return true; // Connection successful
                    
                } catch (collErr) {
                    console.error('Error accessing collections:', collErr.message);
                    throw collErr; // Re-throw to trigger retry
                }
            } else {
                console.error('MongoDB connection state:', mongoose.connection.readyState);
                throw new Error('MongoDB connection not in connected state');
            }
        } catch (err) {
            console.error('Could not connect to MongoDB. Error details:');
            console.error('Message:', err.message);
            console.error('Stack:', err.stack);
            
            retryCount++;
            
            if (retryCount < maxRetries) {
                console.log(`Retrying connection in ${retryDelay}ms... (${retryCount}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return connectWithRetry(); // Retry connection
            } else {
                console.error('Maximum retry attempts reached. Continuing without MongoDB connection');
                
                // Don't exit in production, just log the error and try to continue
                if (process.env.NODE_ENV !== 'production') {
                    process.exit(1);
                } else {
                    console.error('Continuing despite MongoDB connection error in production...');
                    return false; // Connection failed
                }
            }
        }
    };
    
    return connectWithRetry();
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

// Function to check if a file exists
function fileExists(filePath) {
    try {
        fs.accessSync(filePath, fs.constants.F_OK);
        return true;
    } catch (err) {
        return false;
    }
}

// Load glossary from JSON file
let glossary = {};
const possiblePaths = [
    path.join(__dirname, 'public', 'glossary.json'),
    path.join(process.cwd(), 'public', 'glossary.json'),
    path.join(__dirname, './public/glossary.json'),
    './public/glossary.json',
    '/app/public/glossary.json' // Render-specific path
];

console.log('Current directory:', __dirname);
console.log('Process working directory:', process.cwd());

// Check which paths exist
console.log('Checking possible glossary paths:');
possiblePaths.forEach(p => {
    console.log(`- ${p}: ${fileExists(p) ? 'EXISTS' : 'NOT FOUND'}`);
});

// Try each path until we successfully load the glossary
for (const glossaryPath of possiblePaths) {
    try {
        console.log(`Attempting to load glossary from: ${glossaryPath}`);
        if (!fileExists(glossaryPath)) {
            console.log(`Path does not exist: ${glossaryPath}`);
            continue;
        }
        
        const glossaryContent = fs.readFileSync(glossaryPath, 'utf8');
        const parsed = JSON.parse(glossaryContent);
        
        if (parsed && Object.keys(parsed).length > 0) {
            glossary = parsed;
            console.log(`Glossary loaded successfully from ${glossaryPath} with ${Object.keys(glossary).length} words`);
            break; // Successfully loaded, exit the loop
        } else {
            console.log(`Glossary loaded from ${glossaryPath} but appears to be empty`);
        }
    } catch (error) {
        console.error(`Error loading glossary from ${glossaryPath}:`, error.message);
    }
}

if (Object.keys(glossary).length === 0) {
    console.error('CRITICAL: Failed to load glossary from all possible paths');
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
    try {
        const currentPeriod = getCurrentPeriod();
        const { startTime, endTime } = getPeriodTimes(currentPeriod);
        
        console.log(`Fetching word for period: ${currentPeriod}, start: ${startTime}, end: ${endTime}`);
        
        try {
            // Try to find an existing word for the current period
            let existingWord = await Word.findOne({
                interval: currentPeriod,
                date: {
                    $gte: startTime,
                    $lte: endTime
                }
            });

            if (existingWord) {
                console.log(`Found existing word for current period: ${existingWord.word}`);
                return existingWord;
            }
        } catch (dbError) {
            console.error('Error finding existing word:', dbError.message);
            // Continue to creating a new word
        }

        console.log('No existing word found, creating a new one');
        
        // If no word exists for the current period, create a new one
        if (!glossary || Object.keys(glossary).length === 0) {
            console.error('Glossary is empty or not loaded correctly when trying to select a word');
            throw new Error('Glossary data is not available');
        }
        
        const allWords = Object.keys(glossary);
        console.log(`Total words in glossary: ${allWords.length}`);
        
        let recentWordsArray = [];
        try {
            // Get recently used words
            const recentWords = await Word.find({})
                .sort({ date: -1 })
                .limit(10)
                .select('word');

            recentWordsArray = recentWords.map(w => w.word);
            console.log(`Recently used words: ${recentWordsArray.join(', ')}`);
        } catch (recentWordsError) {
            console.error('Error getting recent words:', recentWordsError.message);
            // Continue with an empty array if there's an error
        }
        
        // Filter out already used words, or use all words if needed
        const availableWords = allWords.filter(word => !recentWordsArray.includes(word));
        const wordsToChooseFrom = availableWords.length > 0 ? availableWords : allWords;
        
        if (wordsToChooseFrom.length === 0) {
            console.error('No words available to choose from');
            throw new Error('No words available to select');
        }
        
        console.log(`Available words to choose from: ${wordsToChooseFrom.length}`);
        
        const randomIndex = Math.floor(Math.random() * wordsToChooseFrom.length);
        const selectedWord = wordsToChooseFrom[randomIndex];
        
        console.log(`Selected new word: ${selectedWord}`);

        try {
            // Create and save new word
            const newWord = new Word({
                interval: currentPeriod,
                date: startTime, // Use period start time for consistency
                word: selectedWord
            });

            const savedWord = await newWord.save();
            console.log(`Saved new word to database: ${selectedWord}`);
            return savedWord;
        } catch (saveError) {
            console.error('Error saving new word:', saveError.message);
            
            // If saving fails, just return an in-memory word object
            console.log('Returning non-persisted word object as fallback');
            return {
                interval: currentPeriod,
                date: startTime,
                word: selectedWord
            };
        }
    } catch (error) {
        console.error('Error in getWordForCurrentPeriod:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
        
        // As a last resort, create a hardcoded default word
        console.log('Creating hardcoded default word due to error');
        return {
            interval: getCurrentPeriod(),
            date: new Date(),
            word: "'Abd" // Choose a word that we know exists in the glossary
        };
    }
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
        // Check if glossary is loaded properly
        if (!glossary || Object.keys(glossary).length === 0) {
            console.error('Glossary is empty or not loaded correctly');
            
            // Try to load the glossary again as a last resort
            try {
                const emergencyPath = path.join(process.cwd(), 'public', 'glossary.json');
                if (fileExists(emergencyPath)) {
                    console.log('Emergency attempt to load glossary');
                    const content = fs.readFileSync(emergencyPath, 'utf8');
                    glossary = JSON.parse(content);
                    console.log(`Glossary loaded in emergency with ${Object.keys(glossary).length} words`);
                }
            } catch (emergencyError) {
                console.error('Emergency glossary load failed:', emergencyError.message);
            }
            
            // If still not loaded, return error
            if (!glossary || Object.keys(glossary).length === 0) {
                return res.status(500).json({ 
                    status: 'error', 
                    error: 'Glossary data is not available',
                    glossaryLoaded: false,
                    dirName: __dirname,
                    currentDir: process.cwd(),
                    possiblePaths: [
                        path.join(__dirname, 'public', 'glossary.json'),
                        path.join(process.cwd(), 'public', 'glossary.json'),
                        '/app/public/glossary.json'
                    ]
                });
            }
        }

        // Ensure MongoDB is connected before proceeding
        if (mongoose.connection.readyState !== 1) {
            console.error('MongoDB connection is not ready:', mongoose.connection.readyState);
            return res.status(500).json({
                status: 'error',
                error: 'Database connection is not ready',
                dbState: mongoose.connection.readyState
            });
        }

        // Check if Word collection exists and is accessible
        try {
            const collections = await mongoose.connection.db.listCollections({ name: 'words' }).toArray();
            if (collections.length === 0) {
                console.log('Words collection does not exist yet, it will be created automatically');
            }
        } catch (dbError) {
            console.error('Error checking collections:', dbError);
        }

        const wordForInterval = await getWordForCurrentPeriod();
        
        if (!wordForInterval || !wordForInterval.word) {
            return res.status(500).json({
                status: 'error',
                error: 'Could not retrieve or create a word for this period'
            });
        }
        
        // Log word selection for debugging
        console.log('Selected word for interval:', wordForInterval.word);
        
        // Handle different possible formats of the glossary data
        let meaning = "Definition not found";
        let arabic = "";
        
        const wordData = glossary[wordForInterval.word];
        if (wordData) {
            console.log('Word data found in glossary');
            if (typeof wordData === 'string') {
                // Handle old format where wordData is just the definition string
                meaning = wordData;
            } else if (typeof wordData === 'object') {
                // Handle new format where wordData is an object with definition and arabic
                meaning = wordData.definition || "Definition not found";
                arabic = wordData.arabic || "";
            }
        } else {
            console.error('Word not found in glossary:', wordForInterval.word);
            // If the chosen word is not in the glossary, select a different word that is in the glossary
            const availableWords = Object.keys(glossary);
            if (availableWords.length > 0) {
                const fallbackWord = availableWords[Math.floor(Math.random() * availableWords.length)];
                console.log(`Selected fallback word: ${fallbackWord}`);
                
                // Update meaning and arabic for fallback word
                const fallbackData = glossary[fallbackWord];
                if (typeof fallbackData === 'string') {
                    meaning = fallbackData;
                } else if (typeof fallbackData === 'object') {
                    meaning = fallbackData.definition || "Definition not found";
                    arabic = fallbackData.arabic || "";
                }
                
                // Return the fallback word instead
                return res.json({ 
                    status: 'ok', 
                    word: fallbackWord,
                    meaning: meaning,
                    arabic: arabic,
                    period: getCurrentPeriod(),
                    nextUpdate: getPeriodTimes().endTime,
                    fallback: true
                });
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
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
        
        res.status(500).json({ 
            status: 'error', 
            error: 'Failed to retrieve word', 
            message: error.message 
        });
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

// Add a simple health check endpoint
app.get('/health', (req, res) => {
    const healthCheck = {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
        mongoStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        glossaryLoaded: Object.keys(glossary).length > 0,
        environment: process.env.NODE_ENV || 'development'
    };
    
    res.json(healthCheck);
});

// Add error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    console.error('Error details:', err.message);
    console.error('Stack trace:', err.stack);
    
    res.status(500).json({
        status: 'error',
        error: 'Internal server error',
        message: err.message
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
