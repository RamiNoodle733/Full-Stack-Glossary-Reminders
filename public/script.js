document.addEventListener('DOMContentLoaded', () => {
    // Define base URL for API calls - change between local and production as needed
    const baseURL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? `http://${window.location.hostname}:3000` 
        : 'https://islamic-glossary-reminders.onrender.com';
    
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const signupLink = document.getElementById('signup-link');
    const loginLink = document.getElementById('login-link');
    const glossarySection = document.getElementById('glossary-section');
    const loginSection = document.getElementById('login-section');
    const signupSection = document.getElementById('signup-section');
    const logoutButton = document.getElementById('logout');

    // Add logout functionality
    logoutButton.addEventListener('click', (event) => {
        event.preventDefault();
        localStorage.removeItem('token');
        localStorage.removeItem('word_morning');
        localStorage.removeItem('word_afternoon');
        localStorage.removeItem('word_evening');
        localStorage.removeItem('used_words');
        localStorage.removeItem('last_day_check');
        window.location.href = '/';
    });

    let remainingWords = [];
    let selectedWordForInterval = null;

    // Toggle between login and signup forms
    signupLink.addEventListener('click', (event) => {
        event.preventDefault();
        loginSection.style.display = 'none';
        signupSection.style.display = 'block';
    });

    loginLink.addEventListener('click', (event) => {
        event.preventDefault();
        signupSection.style.display = 'none';
        loginSection.style.display = 'block';
    });

    // Handle login form submission
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        const response = await fetch(`${baseURL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();
        if (data.status === 'ok') {
            localStorage.setItem('token', data.token);
            showGlossarySection();
        } else {
            alert(data.error);
        }
    });

    // Handle signup form submission
    signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = document.getElementById('signup-username').value;
        const password = document.getElementById('signup-password').value;

        const response = await fetch(`${baseURL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();
        if (data.status === 'ok') {
            alert('Signup successful! You can now log in.');
            loginSection.style.display = 'block';
            signupSection.style.display = 'none';
        } else {
            alert(data.error);
        }
    });

    // Show the glossary section after login
    function showGlossarySection() {
        loginSection.style.display = 'none';
        signupSection.style.display = 'none';
        glossarySection.style.display = 'block';
        fetchUserStats();
        fetchRandomWordForInterval();
        checkIfCanCheckIn();
        startCountdown(); // Start the countdown timer
    }

    // Fetch and display the user's total knowledge points, streak, and multiplier
    async function fetchUserStats() {
        const token = localStorage.getItem('token');
        const response = await fetch(`${baseURL}/user-stats`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-access-token': token,
            },
        });
        const data = await response.json();
        console.log('Fetched stats:', data);
        if (data.status === 'ok') {
            document.getElementById('total-points').textContent = data.points.toFixed(2);
            document.getElementById('current-streak').textContent = data.streak;
            document.getElementById('current-multiplier').textContent = data.multiplier.toFixed(2);
        } else {
            alert('Failed to fetch user stats');
        }
    }

    // Fetch and display a random word for the current interval without repetition
    async function fetchRandomWordForInterval() {
        try {
            // Load the glossary from the external JSON file
            const response = await fetch('/glossary.json');
            const glossary = await response.json();

            const currentTime = new Date();
            let currentInterval;

            if (currentTime.getHours() >= 4 && currentTime.getHours() < 12) {
                currentInterval = 'morning';
            } else if (currentTime.getHours() >= 12 && currentTime.getHours() < 20) {
                currentInterval = 'afternoon';
            } else {
                currentInterval = 'evening';
            }

            // Check if we're in a new day - clear previous day's selections
            const lastDayCheck = localStorage.getItem('last_day_check');
            const today = currentTime.toDateString();
            
            if (lastDayCheck !== today) {
                // It's a new day, clear all interval words
                localStorage.removeItem('word_morning');
                localStorage.removeItem('word_afternoon');
                localStorage.removeItem('word_evening');
                localStorage.removeItem('used_words');
                localStorage.setItem('last_day_check', today);
            }

            // Get list of used words or initialize empty array
            let usedWords = JSON.parse(localStorage.getItem('used_words') || '[]');
            
            // Check if a word has already been selected for this interval today
            const savedWordKey = localStorage.getItem(`word_${currentInterval}`);
            let selectedWord;
            
            if (savedWordKey) {
                selectedWord = savedWordKey;
            } else {
                // Get all available words
                const allWords = Object.keys(glossary);
                
                // Filter out already used words
                const availableWords = allWords.filter(word => !usedWords.includes(word));
                
                if (availableWords.length === 0) {
                    // We've used all words, reset the used words tracking
                    usedWords = [];
                    selectedWord = allWords[Math.floor(Math.random() * allWords.length)];
                } else {
                    // Select a random word from available words
                    selectedWord = availableWords[Math.floor(Math.random() * availableWords.length)];
                }
                
                // Add the selected word to used words
                usedWords.push(selectedWord);
                localStorage.setItem('used_words', JSON.stringify(usedWords));
                
                // Save this word for this interval
                localStorage.setItem(`word_${currentInterval}`, selectedWord);
            }

            document.getElementById('glossary-word').textContent = `${selectedWord}: ${glossary[selectedWord]}`;
        } catch (error) {
            console.error('Error fetching glossary:', error);
            document.getElementById('glossary-word').textContent = 'Error loading glossary. Please try refreshing the page.';
        }
    }

    // Check if the user can check in
    async function checkIfCanCheckIn() {
        const token = localStorage.getItem('token');
        const response = await fetch(`${baseURL}/can-check-in`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-access-token': token,
            },
        });

        const data = await response.json();
        const checkInButton = document.getElementById('check-in-button');

        if (data.status === 'ok') {
            checkInButton.classList.remove('disabled');
            checkInButton.disabled = false;
        } else {
            checkInButton.classList.add('disabled');
            checkInButton.disabled = true;
        }
    }

    // Check-in functionality to update knowledge points
    document.getElementById('check-in-button').addEventListener('click', async () => {
        if (document.getElementById('check-in-button').classList.contains('disabled')) return;

        const token = localStorage.getItem('token');
        const response = await fetch(`${baseURL}/update-points`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-access-token': token,
            },
        });

        const data = await response.json();
        if (data.status === 'ok') {
            alert('Knowledge points updated!');
            fetchUserStats(); // Refresh points, streak, and multiplier after check-in
            checkIfCanCheckIn(); // Check if the button should be hidden
        } else {
            alert('Check-in failed');
        }
    });

    // Start the countdown timer for the next word
    function startCountdown() {
        const nextWordTime = new Date();
        if (nextWordTime.getHours() >= 4 && nextWordTime.getHours() < 12) {
            nextWordTime.setHours(12, 0, 0, 0);
        } else if (nextWordTime.getHours() >= 12 && nextWordTime.getHours() < 20) {
            nextWordTime.setHours(20, 0, 0, 0);
        } else {
            nextWordTime.setHours(4, 0, 0, 0);
            nextWordTime.setDate(nextWordTime.getDate() + 1);
        }

        function updateCountdown() {
            const now = new Date();
            const remainingTime = nextWordTime - now;

            const hours = Math.floor(remainingTime / (1000 * 60 * 60));
            const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);

            document.getElementById('next-word-timer').textContent = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            if (remainingTime < 0) {
                clearInterval(timerInterval);
                location.reload(); // Reload the page when the time expires to fetch the new word
            }
        }

        updateCountdown();
        const timerInterval = setInterval(updateCountdown, 1000);
    }
});
