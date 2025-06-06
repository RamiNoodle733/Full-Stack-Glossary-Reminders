const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { RateLimiterMemory } = require('rate-limiter-flexible');
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

// Set up rate limiters
const authRateLimiter = new RateLimiterMemory({
    points: 5, // 5 attempts
    duration: 60, // per 1 minute
});

const apiRateLimiter = new RateLimiterMemory({
    points: 30, // 30 requests
    duration: 60, // per 1 minute
});

// Middleware function for rate limiting auth endpoints
const rateLimitAuth = async (req, res, next) => {
    try {
        const clientIp = req.ip;
        await authRateLimiter.consume(clientIp);
        next();
    } catch (error) {
        res.status(429).json({
            status: 'error',
            error: 'Too many login attempts, please try again later'
        });
    }
};

// Middleware function for rate limiting API endpoints
const rateLimitApi = async (req, res, next) => {
    try {
        // Use combination of IP and user token if available
        let identifier = req.ip;
        const token = req.headers['x-access-token'];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                identifier = `${req.ip}_${decoded.username}`;
            } catch (err) {
                // If token is invalid, just use IP
            }
        }
        await apiRateLimiter.consume(identifier);
        next();
    } catch (error) {
        res.status(429).json({
            status: 'error',
            error: 'Too many requests, please try again later'
        });
    }
};

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

// Helper function to get deterministic word for the current period
async function getWordForCurrentPeriod() {
    try {
        const currentPeriod = getCurrentPeriod();
        const { startTime, endTime } = getPeriodTimes(currentPeriod);
        
        console.log(`Fetching word for period: ${currentPeriod}, start: ${startTime}, end: ${endTime}`);

        // First try to find an existing word for this period
        const existingWord = await Word.findOne({
            interval: currentPeriod,
            date: {
                $gte: startTime,
                $lte: endTime
            }
        }).sort({ date: 1 }); // Sort by date to ensure consistency

        if (existingWord) {
            console.log(`Found existing word for current period: ${existingWord.word}`);
            return existingWord;
        }

        // If no word exists, create a new one using a deterministic method
        if (!glossary || Object.keys(glossary).length === 0) {
            throw new Error('Glossary data is not available');
        }

        // Create a deterministic date seed based on the year, month, day, and period
        // This ensures all users get the same word for the same period
        const dateSeed = startTime.getFullYear() * 10000 + 
                        (startTime.getMonth() + 1) * 100 + // Adding 1 to month since it's 0-based
                        startTime.getDate() +
                        (currentPeriod === 'morning' ? 1 : currentPeriod === 'afternoon' ? 2 : 3); // Add period modifier        // Get all available words
        const allWords = Object.keys(glossary);
        
        // Use a more random but still deterministic selection algorithm
        const hash = (dateSeed * 2654435761) % 2**32; // Use multiplicative hash
        const selectedIndex = hash % allWords.length;
        const selectedWord = allWords[selectedIndex];
        
        console.log(`Selected new word (seed: ${dateSeed}, index: ${selectedIndex}): ${selectedWord}`);

        // Double-check to prevent race conditions
        const doubleCheck = await Word.findOne({
            interval: currentPeriod,
            date: {
                $gte: startTime,
                $lte: endTime
            }
        }).sort({ date: 1 });

        if (doubleCheck) {
            console.log(`Another process created the word: ${doubleCheck.word}`);
            return doubleCheck;
        }

        // Create and save the new word
        const newWord = new Word({
            interval: currentPeriod,
            date: startTime,
            word: selectedWord
        });

        try {
            const savedWord = await newWord.save();
            console.log(`Saved new word to database: ${selectedWord}`);
            return savedWord;
        } catch (saveError) {
            // Handle unique index violation - another process might have created the word
            if (saveError.code === 11000) { // Duplicate key error
                const finalCheck = await Word.findOne({
                    interval: currentPeriod,
                    date: {
                        $gte: startTime,
                        $lte: endTime
                    }
                }).sort({ date: 1 });
                
                if (finalCheck) {
                    return finalCheck;
                }
            }
            
            // If saving fails for other reasons, return an in-memory word object
            console.log('Returning non-persisted word object as fallback');
            return {
                interval: currentPeriod,
                date: startTime,
                word: selectedWord
            };
        }
    } catch (error) {
        console.error('Error in getWordForCurrentPeriod:', error);
        throw error;
    }
}

// Signup route
app.post('/signup', rateLimitAuth, async (req, res) => {
    const { username, password } = req.body;
    
    // Input validation
    if (!username || !password) {
        return res.status(400).json({ status: 'error', error: 'Username and password are required' });
    }
    
    // Sanitize username (allow only alphanumeric characters, underscores, and hyphens)
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return res.status(400).json({ status: 'error', error: 'Username can only contain letters, numbers, underscores, and hyphens' });
    }
    
    // Password strength check
    if (password.length < 8) {
        return res.status(400).json({ status: 'error', error: 'Password must be at least 8 characters long' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const user = await User.create({ username, password: hashedPassword });
        res.json({ status: 'ok', user });
    } catch (err) {
        res.json({ status: 'error', error: 'Duplicate username' });
    }
});

// Login route
app.post('/login', rateLimitAuth, async (req, res) => {
    const { username, password } = req.body;
    
    // Input validation
    if (!username || !password) {
        return res.status(400).json({ status: 'error', error: 'Username and password are required' });
    }
    
    // Sanitize username (allow only alphanumeric characters, underscores, and hyphens)
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return res.status(400).json({ status: 'error', error: 'Invalid username format' });
    }
    
    const user = await User.findOne({ username });
    if (!user) {
        return res.json({ status: 'error', error: 'Invalid login' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (isPasswordValid) {
        const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET);
        return res.json({ status: 'ok', token });
    } else {
        return res.json({ status: 'error', error: 'Invalid login' });
    }
});

// Update knowledge points route
app.post('/update-points', rateLimitApi, async (req, res) => {
    const token = req.headers['x-access-token'];
    
    // Validate token
    if (!token) {
        return res.status(401).json({ status: 'error', error: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Validate username from token
        const username = decoded.username;
        if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(username)) {
            return res.status(401).json({ status: 'error', error: 'Invalid token' });
        }
        
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ status: 'error', error: 'User not found' });
        }

        const currentPeriod = getCurrentPeriod();
        const { startTime, endTime } = getPeriodTimes(currentPeriod);
        const lastCheckIn = user.lastCheckIn ? new Date(user.lastCheckIn) : null;

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

        // Try to find or generate word for this period
        let wordToUse = await Word.findOne({
            interval: currentPeriod,
            date: {
                $gte: startTime,
                $lte: endTime
            }
        }).sort({ date: 1 }); // Sort by date to ensure we get the earliest word in the period

        if (!wordToUse) {
            try {
                wordToUse = await getWordForCurrentPeriod();
                if (!wordToUse) {
                    return res.json({ 
                        status: 'error', 
                        error: 'No word available for current period',
                        points: user.knowledgePoints,
                        streak: user.streak,
                        multiplier: user.multiplier
                    });
                }
            } catch (genError) {
                console.error('Error generating word:', genError);
                return res.json({ 
                    status: 'error', 
                    error: 'Failed to generate word',
                    points: user.knowledgePoints,
                    streak: user.streak,
                    multiplier: user.multiplier
                });
            }
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
        console.log('Updated user stats:', {
            points: user.knowledgePoints,
            streak: user.streak,
            multiplier: user.multiplier,
            pointsEarned
        });
        
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
app.get('/user-stats', rateLimitApi, async (req, res) => {
    const token = req.headers['x-access-token'];
    
    // Validate token
    if (!token) {
        return res.status(401).json({ status: 'error', error: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Validate username from token
        const username = decoded.username;
        if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(username)) {
            return res.status(401).json({ status: 'error', error: 'Invalid token' });
        }
        
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ status: 'error', error: 'User not found' });
        }
        
        res.json({ status: 'ok', points: user.knowledgePoints, streak: user.streak, multiplier: user.multiplier });
    } catch (error) {
        res.status(401).json({ status: 'error', error: 'Failed to fetch stats' });
    }
});

// Fetch or generate word for interval route
app.get('/word-for-interval', rateLimitApi, async (req, res) => {
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
          // Get the current period and its end time for the next update
        const currentPeriod = getCurrentPeriod();
        const { endTime } = getPeriodTimes(currentPeriod);
        
        res.json({ 
            status: 'ok', 
            word: wordForInterval.word,
            meaning: meaning,
            arabic: arabic,
            period: currentPeriod,
            nextUpdate: endTime
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
app.get('/leaderboard', rateLimitApi, async (req, res) => {
    try {
        const users = await User.find().sort({ knowledgePoints: -1 }).limit(10); // Top 10 users
        res.json({ status: 'ok', users });
    } catch (error) {
        res.json({ status: 'error', error: 'Failed to fetch leaderboard' });
    }
});

// Check if user can check in
app.get('/can-check-in', rateLimitApi, async (req, res) => {
    const token = req.headers['x-access-token'];
    try {
        if (!token) {
            return res.status(401).json({
                status: 'error',
                error: 'No token provided'
            });
        }
        
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (tokenError) {
            console.error('Token verification error:', tokenError.message);
            return res.status(401).json({
                status: 'error',
                error: 'Invalid token'
            });
        }
        
        // Validate username from token
        const username = decoded.username;
        if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(username)) {
            return res.status(401).json({ status: 'error', error: 'Invalid token' });
        }
        
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

        // Log values for debugging
        console.log('Check-in status for user:', username);
        console.log('Current period:', currentPeriod);
        console.log('Period start time:', startTime);
        console.log('Period end time:', endTime);
        console.log('Last check-in time:', lastCheckIn);
        
        // Check if user has already checked in for this period
        if (lastCheckIn && lastCheckIn >= startTime && lastCheckIn <= endTime) {
            console.log('User has already checked in for this period');
            return res.json({ 
                status: 'error', 
                error: 'Already checked in for this period',
                points: user.knowledgePoints,
                streak: user.streak,
                multiplier: user.multiplier,
                checkedIn: true
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
            console.log('No word available for current period');
            return res.json({ 
                status: 'error',
                error: 'No word available for current period',
                points: user.knowledgePoints,
                streak: user.streak,
                multiplier: user.multiplier,
                checkedIn: false
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
app.get('/word-history', rateLimitApi, async (req, res) => {
    try {
        const token = req.headers['x-access-token'];
        if (!token) {
            return res.status(401).json({ status: 'error', error: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Validate username from token
        const username = decoded.username;
        if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(username)) {
            return res.status(401).json({ status: 'error', error: 'Invalid token' });
        }
        
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
app.get('/achievements', rateLimitApi, async (req, res) => {
    const token = req.headers['x-access-token'];
    
    // Validate token
    if (!token) {
        return res.status(401).json({ status: 'error', error: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Validate username from token
        const username = decoded.username;
        if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(username)) {
            return res.status(401).json({ status: 'error', error: 'Invalid token' });
        }
        
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ status: 'error', error: 'User not found' });
        }
        
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
