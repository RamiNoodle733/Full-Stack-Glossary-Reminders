const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config(); // Load environment variables

// Initialize express app
const app = express();
app.use(cors({
    origin: 'https://islamic-glossary-reminders.onrender.com', // Update with your Render URL
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());

// MongoDB connection using environment variable
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('Could not connect to MongoDB', err));

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
});

const User = mongoose.model('User', UserSchema);

// Define Word schema and model for storing selected words
const WordSchema = new mongoose.Schema({
    interval: { type: String, unique: true }, // 'morning', 'afternoon', 'evening'
    word: String
});

const Word = mongoose.model('Word', WordSchema);

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

        if (!user.checkIns[currentInterval] || new Date(user.checkIns[currentInterval]).getDate() !== currentTime.getDate()) {
            user.checkIns[currentInterval] = currentTime;
            if (!sameDay) {
                user.streak++;
                user.multiplier = Math.min(15, user.multiplier * 1.2); // Cap multiplier at 15
            }
            user.knowledgePoints += user.multiplier;
            user.lastCheckIn = currentTime;
            await user.save();
            return res.json({ status: 'ok', points: user.knowledgePoints });
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

// Fetch or generate word for interval route
app.get('/word-for-interval', async (req, res) => {
    const currentTime = new Date();
    let currentInterval;

    if (currentTime.getHours() >= 4 && currentTime.getHours() < 12) {
        currentInterval = 'morning';
    } else if (currentTime.getHours() >= 12 && currentTime.getHours() < 20) {
        currentInterval = 'afternoon';
    } else {
        currentInterval = 'evening';
    }

    let wordForInterval = await Word.findOne({ interval: currentInterval });

    if (!wordForInterval) {
        const glossary = {
            // Load or reference your glossary here
        };
        const remainingWords = Object.keys(glossary);
        const randomIndex = Math.floor(Math.random() * remainingWords.length);
        const selectedWord = remainingWords[randomIndex];

        wordForInterval = new Word({
            interval: currentInterval,
            word: selectedWord
        });
        await wordForInterval.save();
    }

    res.json({ status: 'ok', word: wordForInterval.word });
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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
