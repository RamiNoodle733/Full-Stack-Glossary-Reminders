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
    const notification = document.getElementById('notification');
    const aboutLink = document.getElementById('about-link');
    const aboutModal = document.getElementById('about-modal');
    const closeAboutButton = document.getElementById('close-about');

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
    });    // Show the glossary section after login
    async function showGlossarySection() {
        loginSection.style.display = 'none';
        signupSection.style.display = 'none';
        glossarySection.style.display = 'block';
        
        // Check server health first
        await checkServerHealth();
        
        fetchUserStats();
        fetchRandomWordForInterval();
        fetchAchievements();
        checkIfCanCheckIn();
        startCountdown();
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
                updateStats(data);
            }
        } catch (error) {
            console.error('Error fetching user stats:', error);
        }
    }

    // Update stats display
    function updateStats(data) {
        document.getElementById('total-points').textContent = data.points.toFixed(1);
        document.getElementById('current-streak').textContent = data.streak;
        document.getElementById('current-multiplier').textContent = data.multiplier.toFixed(1);
    }    // Helper function to check server health
    async function checkServerHealth() {
        try {
            const response = await fetch(`${baseURL}/health`);
            if (!response.ok) {
                throw new Error(`Health check failed with status: ${response.status}`);
            }
            const data = await response.json();
            console.log('Server health check:', data);
            return data;
        } catch (error) {
            console.error('Health check error:', error);
            return null;
        }
    }
      // Fetch and display the current word from the server
    async function fetchRandomWordForInterval() {
        document.getElementById('glossary-word').innerHTML = `
            <div class="loading-container">
                <p>Loading glossary word...</p>
                <div class="spinner"></div>
            </div>
        `;
        
        let retryCount = localStorage.getItem('wordRetryCount') || 0;
        
        try {
            // First check server health
            const healthStatus = await checkServerHealth();
            console.log('Health status:', healthStatus);
            
            if (!healthStatus) {
                console.warn('Health check failed or unavailable');
            } else if (healthStatus && !healthStatus.glossaryLoaded) {
                throw new Error('Glossary data is not loaded on the server');
            }
            
            const token = localStorage.getItem('token');
            
            // Add a cache-busting parameter to prevent caching issues
            const cacheBuster = new Date().getTime();
            
            console.log('Fetching word from:', `${baseURL}/word-for-interval?_=${cacheBuster}`);
            
            const response = await fetch(`${baseURL}/word-for-interval?_=${cacheBuster}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                },
            });

            if (!response.ok) {
                // Track retry count
                retryCount = parseInt(retryCount) + 1;
                localStorage.setItem('wordRetryCount', retryCount);
                
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Reset retry count on success
            localStorage.setItem('wordRetryCount', 0);
            
            const data = await response.json();
            console.log('Word fetch response:', data);
            
            if (data.status === 'ok' && data.word) {
                const glossaryWord = document.getElementById('glossary-word');
                glossaryWord.style.opacity = '0';
                setTimeout(() => {
                    glossaryWord.innerHTML = `
                        <div class="word-container">
                            <span class="english-word">${data.word}</span>
                            <span class="arabic-word">${data.arabic || ''}</span>
                            ${data.fallback ? '<span class="fallback-badge">Fallback Word</span>' : ''}
                        </div>
                        <div class="definition-container">
                            <p class="definition">${data.meaning}</p>
                        </div>
                    `;
                    glossaryWord.style.opacity = '1';
                }, 300);
                checkIfCanCheckIn(); // Check check-in status when new word is loaded
            } else {
                // Handle case where data.status is not ok or there's no word
                console.error('Invalid word data received:', data);
                
                document.getElementById('glossary-word').innerHTML = `
                    <div class="error-container">
                        <p class="error-message">Error loading glossary word.</p>
                        <p class="error-details">${data.error || 'No word available'}</p>
                        <button onclick="fetchRandomWordForInterval()" class="retry-button">Try Again</button>
                        ${retryCount >= 3 ? '<p class="help-text">Try refreshing the page or logging out and back in.</p>' : ''}
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error fetching word:', error);
            
            document.getElementById('glossary-word').innerHTML = `
                <div class="error-container">
                    <p class="error-message">Error loading glossary word.</p>
                    <p class="error-details">${error.message}</p>
                    <button onclick="fetchRandomWordForInterval()" class="retry-button">Try Again</button>
                    ${retryCount >= 3 ? 
                        `<div class="troubleshooting-tips">
                            <p class="help-text">Troubleshooting Tips:</p>
                            <ul>
                                <li>Refresh the page</li>
                                <li>Clear your browser cache</li>
                                <li>Log out and log back in</li>
                                <li>Try again in a few minutes</li>
                            </ul>
                        </div>` : ''}
                </div>
            `;
        }
    }    // Check if the user can check in
    async function checkIfCanCheckIn() {
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('No token available, skipping check-in status check');
            return;
        }
        
        const checkInButton = document.getElementById('check-in-button');
        
        try {
            // Always check with the server first
            const cacheBuster = new Date().getTime();
            const response = await fetch(`${baseURL}/can-check-in?_=${cacheBuster}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                },
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json();
            console.log('Check-in status response:', data);

            // Clear any stale local storage data
            localStorage.removeItem('currentPeriod');
            const storedPeriods = ['morning', 'afternoon', 'night'];
            storedPeriods.forEach(period => {
                localStorage.removeItem(`checkedIn_${period}`);
            });

            if (data.status === 'error' && data.error === 'Already checked in for this period') {
                // User has already checked in
                checkInButton.classList.add('disabled');
                checkInButton.disabled = true;
                checkInButton.innerHTML = '<i class="fas fa-check"></i> Checked In';
                console.log('User has already checked in for this period');
            } else if (data.status === 'ok') {
                // User can check in
                checkInButton.classList.remove('disabled');
                checkInButton.disabled = false;
                checkInButton.innerHTML = '<i class="fas fa-check-circle"></i> Check In';
                console.log('User can check in');
            } else {
                // Handle other error cases
                console.error('Check-in status error:', data.error);
                checkInButton.classList.remove('disabled');
                checkInButton.disabled = false;
                checkInButton.innerHTML = '<i class="fas fa-check-circle"></i> Check In';
            }
            
            // Update stats even when checking check-in status
            if (data.points !== undefined) {
                updateStats(data);
            }
        } catch (error) {
            console.error('Error checking if can check in:', error);
            // Keep button enabled on error
            checkInButton.classList.remove('disabled');
            checkInButton.disabled = false;
            checkInButton.innerHTML = '<i class="fas fa-check-circle"></i> Check In';
        }
    }

    // Check-in functionality to update knowledge points
    document.getElementById('check-in-button').addEventListener('click', async () => {
        const checkInButton = document.getElementById('check-in-button');
        
        if (checkInButton.classList.contains('disabled') || checkInButton.disabled) {
            return;
        }

        // Disable button immediately to prevent double clicks
        checkInButton.classList.add('disabled');
        checkInButton.disabled = true;
        const originalButtonText = checkInButton.innerHTML;
        checkInButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking in...';

        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`${baseURL}/update-points`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token,
                },
            });

            const data = await response.json();            if (data.status === 'ok') {
                showNotification(`Knowledge points updated! +${data.pointsEarned} points!`, 'success');
                checkInButton.classList.add('disabled');
                checkInButton.disabled = true;
                checkInButton.innerHTML = '<i class="fas fa-check"></i> Checked In';
                
                // Update stats with new values
                updateStats(data);
                
                if (data.newAchievements && data.newAchievements.length > 0) {
                    setTimeout(() => {
                        showNotification(`Achievement Unlocked: ${data.newAchievements.join(', ')}`, 'achievement');
                    }, 1000);
                    fetchAchievements();
                }
            } else {
                // Re-enable button if check-in failed (unless already checked in)
                if (data.error !== 'Already checked in for this word') {
                    checkInButton.classList.remove('disabled');
                    checkInButton.disabled = false;
                    checkInButton.innerHTML = originalButtonText;
                }
                showNotification(data.error || 'Check-in failed', 'error');
                
                // Update stats even on error as they might have changed
                if (data.points !== undefined) {
                    updateStats(data);
                }
            }
        } catch (error) {
            console.error('Error during check-in:', error);
            showNotification('Connection error during check-in', 'error');
            // Re-enable button on connection error
            checkInButton.classList.remove('disabled');
            checkInButton.disabled = false;
            checkInButton.innerHTML = originalButtonText;
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
    }    // Fetch the next word time from server and calculate countdown
    async function startCountdown() {
        let nextWordTime = null;
        let timerId = null;
        let serverCheckTimer = null;

        async function fetchNextWordTime() {
            const now = new Date();
            
            // Try to get the next word time from server
            const token = localStorage.getItem('token');
            if (!token) return;

            try {
                const response = await fetch(`${baseURL}/word-for-interval`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-access-token': token,
                        'Cache-Control': 'no-cache'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.nextUpdate) {
                        nextWordTime = new Date(data.nextUpdate);
                        console.log("Next update time from server:", nextWordTime);
                        return;
                    }
                }
            } catch (error) {
                console.error("Error fetching next update time:", error);
            }

            // If we couldn't get the time from the server, calculate it locally
            const utcHour = now.getUTCHours();
            const cdtHour = (utcHour - 5 + 24) % 24; // Convert to CDT
            nextWordTime = new Date(now);
            
            // Reset minutes and seconds to 0 for clean intervals
            nextWordTime.setMinutes(0, 0, 0);

            if (cdtHour >= 20) {
                // Night period (8 PM - 6 AM), next is tomorrow 6 AM
                nextWordTime.setUTCHours(11); // 6 AM CDT tomorrow
                nextWordTime.setDate(nextWordTime.getDate() + 1);
            } else if (cdtHour < 6) {
                // Night period (8 PM - 6 AM), next is 6 AM today
                nextWordTime.setUTCHours(11); // 6 AM CDT today
            } else if (cdtHour < 15) {
                // Morning period (6 AM - 3 PM), next is 3 PM today
                nextWordTime.setUTCHours(20); // 3 PM CDT today
            } else {
                // Afternoon period (3 PM - 8 PM), next is 8 PM today
                nextWordTime.setUTCHours(1); // 8 PM CDT today
                if (utcHour < 1) { // If we're before the UTC cutoff
                    nextWordTime.setDate(nextWordTime.getDate() + 1);
                }
            }
            console.log("Next update time calculated locally:", nextWordTime);
        }

        function updateDisplay() {
            try {
                if (!nextWordTime) return;
                
                const now = new Date();
                const remainingTime = nextWordTime - now;
                
                if (remainingTime <= 0) {
                    if (timerId) {
                        clearInterval(timerId);
                    }
                    if (serverCheckTimer) {
                        clearInterval(serverCheckTimer);
                    }
                    showNotification("It's time for a new word!");
                    
                    // Reload after a short delay to prevent multiple reloads
                    setTimeout(() => {
                        fetchRandomWordForInterval()
                            .then(() => {
                                checkIfCanCheckIn();
                                // Start a new countdown but wait a bit to avoid race conditions
                                setTimeout(startCountdown, 1000);
                            })
                            .catch(error => {
                                console.error('Failed to fetch new word:', error);
                                showNotification('Failed to load the next word. Retrying in 10 seconds...', 'error');
                                // Try again after 10 seconds if it fails
                                setTimeout(() => {
                                    fetchRandomWordForInterval();
                                    checkIfCanCheckIn();
                                    startCountdown();
                                }, 10000);
                            });
                    }, 1000);
                    return;
                }

                const hours = Math.floor(remainingTime / (1000 * 60 * 60));
                const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);                document.getElementById('next-word-timer').innerHTML = 
                    `<span class="countdown">${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}</span>`;
            } catch (error) {
                console.error("Error in display update:", error);
            }
        }

        // Initialize
        await fetchNextWordTime();

        // Clear any existing intervals
        if (timerId) {
            clearInterval(timerId);
        }
        if (serverCheckTimer) {
            clearInterval(serverCheckTimer);
        }

        // Update display immediately
        updateDisplay();

        // Set up one minute interval for fetching new time from server
        serverCheckTimer = setInterval(async () => {
            await fetchNextWordTime();
        }, 60000);
        
        // Set up one second interval for updating display
        timerId = setInterval(updateDisplay, 1000);
        
        return timerId;
    }

    // About modal functionality
    aboutLink.addEventListener('click', (event) => {
        event.preventDefault();
        aboutModal.style.display = 'flex';
    });

    closeAboutButton.addEventListener('click', () => {
        aboutModal.style.display = 'none';
    });

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === aboutModal) {
            aboutModal.style.display = 'none';
        }
    });

    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (token) {
        showGlossarySection();
    } else {
        loginSection.style.display = 'block';
    }
});
