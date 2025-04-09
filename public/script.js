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
    const searchButton = document.getElementById('search-button');
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const wordHistorySection = document.getElementById('word-history-section');
    const notification = document.getElementById('notification');

    // Function to show notification
    function showNotification(message, type = 'success') {
        notification.textContent = message;
        notification.className = `notification ${type} show`;
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    // Add logout functionality
    logoutButton.addEventListener('click', (event) => {
        event.preventDefault();
        localStorage.removeItem('token');
        localStorage.removeItem('word_morning');
        localStorage.removeItem('word_afternoon');
        localStorage.removeItem('word_evening');
        localStorage.removeItem('used_words');
        localStorage.removeItem('last_day_check');
        showNotification('Logged out successfully');
        window.location.href = '/';
    });

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

        try {
            const response = await fetch(`${baseURL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();
            if (data.status === 'ok') {
                localStorage.setItem('token', data.token);
                showNotification(`Welcome back, ${username}!`);
                showGlossarySection();
            } else {
                showNotification(data.error, 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            showNotification('Connection error. Please try again.', 'error');
        }
    });

    // Handle signup form submission
    signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = document.getElementById('signup-username').value;
        const password = document.getElementById('signup-password').value;

        if (password.length < 6) {
            showNotification('Password must be at least 6 characters long', 'error');
            return;
        }

        try {
            const response = await fetch(`${baseURL}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();
            if (data.status === 'ok') {
                showNotification('Signup successful! You can now log in.');
                loginSection.style.display = 'block';
                signupSection.style.display = 'none';
            } else {
                showNotification(data.error, 'error');
            }
        } catch (error) {
            console.error('Signup error:', error);
            showNotification('Connection error. Please try again.', 'error');
        }
    });

    // Show the glossary section after login
    function showGlossarySection() {
        loginSection.style.display = 'none';
        signupSection.style.display = 'none';
        glossarySection.style.display = 'block';
        wordHistorySection.style.display = 'block';
        fetchUserStats();
        fetchRandomWordForInterval();
        fetchWordHistory();
        fetchAchievements();
        checkIfCanCheckIn();
        startCountdown(); // Start the countdown timer
    }

    // Fetch and display the user's total knowledge points, streak, and multiplier
    async function fetchUserStats() {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`${baseURL}/user-stats`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token,
                },
            });
            const data = await response.json();
            if (data.status === 'ok') {
                document.getElementById('total-points').textContent = data.points.toFixed(2);
                document.getElementById('current-streak').textContent = data.streak;
                document.getElementById('current-multiplier').textContent = data.multiplier.toFixed(2);
            } else {
                showNotification('Failed to fetch user stats', 'error');
            }
        } catch (error) {
            console.error('Error fetching user stats:', error);
            showNotification('Connection error when fetching stats', 'error');
        }
    }

    // Fetch and display the current word from the server - same for all users
    async function fetchRandomWordForInterval() {
        try {
            // Get the word from the server instead of generating locally
            const token = localStorage.getItem('token');
            const response = await fetch(`${baseURL}/word-for-interval`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token,
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.status === 'ok' && data.word) {
                const glossaryWord = document.getElementById('glossary-word');
                
                // Apply fade out and in animation
                glossaryWord.style.opacity = '0';
                
                setTimeout(() => {
                    glossaryWord.textContent = `${data.word}: ${data.meaning}`;
                    glossaryWord.style.opacity = '1';
                }, 300);
            } else {
                throw new Error('Failed to get word from server');
            }
        } catch (error) {
            console.error('Error fetching word:', error);
            document.getElementById('glossary-word').textContent = 'Error loading glossary word. Please try refreshing the page.';
            showNotification('Error loading glossary word', 'error');
        }
    }

    // Fetch word history
    async function fetchWordHistory() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${baseURL}/word-history`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token,
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.status === 'ok' && data.history) {
                displayWordHistory(data.history);
            } else {
                throw new Error('Failed to get word history');
            }
        } catch (error) {
            console.error('Error fetching word history:', error);
            document.getElementById('word-history-container').innerHTML = 
                '<p>Error loading word history. Please try refreshing the page.</p>';
        }
    }

    // Display word history
    function displayWordHistory(history) {
        const container = document.getElementById('word-history-container');
        if (history.length === 0) {
            container.innerHTML = '<p>No word history available yet.</p>';
            return;
        }

        const historyList = document.createElement('ul');
        historyList.className = 'history-list';
        
        history.forEach(entry => {
            const date = new Date(entry.date);
            const formattedDate = date.toLocaleDateString(undefined, { 
                weekday: 'short',
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <span class="history-word">${entry.word}</span>
                <span class="history-interval">${entry.interval}</span>
                <span class="history-date">${formattedDate}</span>
            `;
            
            // Make history item clickable to show definition
            listItem.addEventListener('click', () => {
                showWordDefinition(entry.word, entry.meaning);
            });
            
            historyList.appendChild(listItem);
        });
        
        container.innerHTML = '';
        container.appendChild(historyList);
    }

    // Show word definition in a modal or popup
    function showWordDefinition(word, meaning) {
        showNotification(`${word}: ${meaning}`, 'info');
    }

    // Check if the user can check in
    async function checkIfCanCheckIn() {
        const token = localStorage.getItem('token');
        try {
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
        } catch (error) {
            console.error('Error checking if can check in:', error);
            showNotification('Error checking check-in status', 'error');
        }
    }

    // Check-in functionality to update knowledge points
    document.getElementById('check-in-button').addEventListener('click', async () => {
        if (document.getElementById('check-in-button').classList.contains('disabled')) return;

        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`${baseURL}/update-points`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token,
                },
            });

            const data = await response.json();
            if (data.status === 'ok') {
                showNotification('Knowledge points updated! Keep learning!');
                
                // Check if any new achievements were earned
                if (data.newAchievements && data.newAchievements.length > 0) {
                    setTimeout(() => {
                        showNotification(`Achievement Unlocked: ${data.newAchievements.join(', ')}`, 'achievement');
                    }, 1000);
                    
                    // Refresh achievements display
                    fetchAchievements();
                }
                
                fetchUserStats(); // Refresh points, streak, and multiplier after check-in
                checkIfCanCheckIn(); // Check if the button should be disabled
            } else {
                showNotification('Check-in failed', 'error');
            }
        } catch (error) {
            console.error('Error during check-in:', error);
            showNotification('Connection error during check-in', 'error');
        }
    });

    // Fetch and display user achievements
    async function fetchAchievements() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${baseURL}/achievements`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token,
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.status === 'ok' && data.achievements) {
                displayAchievements(data.achievements);
                document.getElementById('achievements-section').style.display = 'block';
            } else {
                throw new Error('Failed to get achievements');
            }
        } catch (error) {
            console.error('Error fetching achievements:', error);
            document.getElementById('achievements-container').innerHTML = 
                '<p>Error loading achievements. Please try refreshing the page.</p>';
        }
    }

    // Display user achievements
    function displayAchievements(achievements) {
        const container = document.getElementById('achievements-container');
        container.innerHTML = '';
        
        Object.values(achievements).forEach(achievement => {
            const card = document.createElement('div');
            card.className = achievement.earned ? 'achievement-card' : 'achievement-card locked';
            
            const earnedDate = achievement.date ? new Date(achievement.date).toLocaleDateString() : '';
            
            card.innerHTML = `
                <div class="achievement-icon"><i class="fas ${achievement.icon}"></i></div>
                <div class="achievement-name">${achievement.name}</div>
                <div class="achievement-desc">${achievement.description}</div>
                ${achievement.earned ? `<div class="achievement-date">Earned: ${earnedDate}</div>` : ''}
            `;
            
            container.appendChild(card);
        });
    }

    // Search functionality
    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    async function performSearch() {
        const searchTerm = searchInput.value.trim();
        
        if (searchTerm.length < 2) {
            showNotification('Please enter at least 2 characters to search', 'error');
            return;
        }
        
        try {
            const response = await fetch(`${baseURL}/search-glossary?term=${encodeURIComponent(searchTerm)}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            displaySearchResults(data);
        } catch (error) {
            console.error('Search error:', error);
            showNotification('Error performing search', 'error');
        }
    }

    function displaySearchResults(data) {
        searchResults.innerHTML = '';
        searchResults.style.display = 'block';
        
        if (data.status === 'error') {
            searchResults.innerHTML = `<p class="error-message">${data.error}</p>`;
            return;
        }
        
        const results = data.results;
        const resultsCount = Object.keys(results).length;
        
        if (resultsCount === 0) {
            searchResults.innerHTML = '<p>No results found.</p>';
            return;
        }
        
        const resultsList = document.createElement('ul');
        resultsList.className = 'search-results-list';
        
        Object.entries(results).forEach(([term, definition]) => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `<strong>${term}:</strong> ${definition}`;
            resultsList.appendChild(listItem);
        });
        
        searchResults.innerHTML = `<h4>Found ${resultsCount} result(s):</h4>`;
        searchResults.appendChild(resultsList);
    }

    // Start the countdown timer for the next word
    function startCountdown() {
        const nextWordTime = new Date();
        
        // Setting next word time to tomorrow at midnight (regardless of current time)
        nextWordTime.setHours(24, 0, 0, 0);

        function updateCountdown() {
            const now = new Date();
            const remainingTime = nextWordTime - now;

            const hours = Math.floor(remainingTime / (1000 * 60 * 60));
            const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);

            document.getElementById('next-word-timer').innerHTML = 
                `<i class="fas fa-hourglass-half"></i> Time until next word: 
                <span class="countdown">${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}</span>`;

            if (remainingTime < 0) {
                clearInterval(timerInterval);
                showNotification(`It's time for a new word!`);
                location.reload(); // Reload the page when the time expires to fetch the new word
            }
        }

        updateCountdown();
        const timerInterval = setInterval(updateCountdown, 1000);
    }

    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (token) {
        showGlossarySection();
    } else {
        loginSection.style.display = 'block';
    }
});
