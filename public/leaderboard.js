document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Define base URL for API calls - change between local and production as needed
        const baseURL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? `http://${window.location.hostname}:3000` 
            : 'https://islamic-glossary-reminders.onrender.com';

        const response = await fetch(`${baseURL}/leaderboard`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();
        const leaderboardList = document.getElementById('leaderboard-list');

        if (data.status === 'ok' && data.users && data.users.length > 0) {
            // Clear any existing content
            leaderboardList.innerHTML = '';
            
            // Create a table for better formatting
            const table = document.createElement('table');
            table.className = 'leaderboard-table';
            
            // Create table header
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            
            const rankHeader = document.createElement('th');
            rankHeader.textContent = 'Rank';
            
            const nameHeader = document.createElement('th');
            nameHeader.textContent = 'Username';
            
            const pointsHeader = document.createElement('th');
            pointsHeader.textContent = 'Knowledge Points';
            
            headerRow.appendChild(rankHeader);
            headerRow.appendChild(nameHeader);
            headerRow.appendChild(pointsHeader);
            thead.appendChild(headerRow);
            table.appendChild(thead);
            
            // Create table body
            const tbody = document.createElement('tbody');
            
            // Add each user to the leaderboard
            data.users.forEach((user, index) => {
                const row = document.createElement('tr');
                
                // Add rank cell with special styling for top 3
                const rankCell = document.createElement('td');
                rankCell.textContent = index + 1;
                if (index === 0) {
                    rankCell.className = 'gold-rank';
                } else if (index === 1) {
                    rankCell.className = 'silver-rank';
                } else if (index === 2) {
                    rankCell.className = 'bronze-rank';
                }
                
                // Add username cell
                const nameCell = document.createElement('td');
                nameCell.textContent = user.username;
                
                // Add points cell
                const pointsCell = document.createElement('td');
                pointsCell.textContent = `${user.knowledgePoints.toFixed(2)} points`;
                
                row.appendChild(rankCell);
                row.appendChild(nameCell);
                row.appendChild(pointsCell);
                tbody.appendChild(row);
            });
            
            table.appendChild(tbody);
            leaderboardList.appendChild(table);
        } else {
            const message = document.createElement('p');
            message.className = 'no-data-message';
            message.textContent = 'No leaderboard data available yet. Be the first to earn knowledge points!';
            leaderboardList.appendChild(message);
        }
    } catch (error) {
        console.error('Error fetching leaderboard data:', error);
        const errorMessage = document.createElement('p');
        errorMessage.className = 'error-message';
        errorMessage.textContent = 'Failed to load leaderboard. Please try again later.';
        document.getElementById('leaderboard-list').appendChild(errorMessage);
    }
});
