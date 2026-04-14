require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
);

const scopes = [
    'https://www.googleapis.com/auth/calendar'
];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
});

console.log('\nOpen this URL in your browser:\n');
console.log(authUrl);
console.log('\nAfter approving access, paste the code here.\n');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question('Code: ', async (code) => {
    try {
        const { tokens } = await oauth2Client.getToken(code.trim());
        console.log('\nTokens:\n');
        console.log(JSON.stringify(tokens, null, 2));

        if (tokens.refresh_token) {
            console.log('\nPut this into your .env as GOOGLE_REFRESH_TOKEN:\n');
            console.log(tokens.refresh_token);
        } else {
            console.log('\nNo refresh token was returned. Make sure prompt=consent and access_type=offline are used.');
        }
    } catch (err) {
        console.error('\nFailed to get token:', err.message);
        if (err.response?.data) {
            console.error(JSON.stringify(err.response.data, null, 2));
        }
    } finally {
        rl.close();
    }

});