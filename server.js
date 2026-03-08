const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    }
});

app.use(cors());
app.use(express.json());

//here we are checking the health
app.get("/health", (req, res) => {
    res.json({ status: 'alive' , ghost: 'watching'}); 
});

//ghost is analyzing the endpoint here
app.post('/api/ghost/analyze', async (req, res) => {
    const {code , language , state } = req.body;

    try {
        const ghostSays = await analyzeCode (code, state || 'RELAXED');
        res.json({ ghostSays });
    } catch (error) {
        console.error('Ghost failed the ghostSays:', error.message)
        res.json(getFallbackResponse(state || 'RELAXED'));
    }
});

//Connection with the Claude API and limit the max tokens so it doesnt fuck my plan
const Anthropic = require ('@anthropic-ai/sdk'); 
const claude = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY
}); 

async function analyzeCode (code, state) {
    const prompts = {
        FOCUS: 'You are a minimal ghost. Respond in 1-3 words max. Do not interrupt the focus the user has',
        STRESSED: 'You are a warm, supportive ghost. Be encouraging, gentle. Keep it short and kind. The user is stressed and needs to feel better about their work and their current situation',
        FATIGUED: 'You are a protective ghost. Suggest breaks and analyze biometrics for the best suggestions. Be gentle with the user',
        RELAXED: 'You are a courious ghost. Ask questions. Explore ideas. Brainstorm with the user if needed',
        WIRED: 'You are a direct ghost. Give quick fixes. Be action oriented than sentimental'
    }; 
    
    const response = await claude.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: prompts[state] || prompts.RELAXED,
        messages: [
          { role: 'user', content: `Analyze this code briefly:\n${code}` }
        ]

    });

    return {
        text: response.content[0].text, 
        emotion: state, 
        suggestion: null
    
    };

}

function getFallbackResponse(state) {
    const fallbacks = {
        FOCUS: { text: '...', emotion: 'FOCUS', suggestion: null },
        STRESSED: { text: 'You\'re doing great, keep going.', emotion: 'STRESSED', suggestion: null}, 
        FATIGUED: { text: 'Maybe it is time for a short break?', emotion: 'FATIGUED', suggestion: 'break'},
        RELAXED: { text: 'Nice approach!', emotion: 'RELAXED', suggestion: null}, 
        WIRED: { text: 'Ship it dawg, you are a beast.', emotion: 'WIRED', suggestion: null}
    };
    return fallbacks[state] || fallbacks.RELAXED; 
}

// socket.io 
io.on('connection', (socket) => {
    console.log('Programmer ready', socket.id);

    socket.on('code:changed', async (data) => {
        const ghostSays = await analyzeCode (data.code, data.state || 'RELAXED') 
        socket.emit ('ghost:speak', ghostSays);
    });
    
    socket.on('challenge.submitted', (data) => {
        console.log('Challenge submitted:', data.challengeId); 
        socket.emit('score:update', { score: 100, multiplier: 1.0, streak: 1}); 

    });

    socket.on('interaction:triggered',  (data) => {
        console.log('Interaction made', data.object);
    });

    socket.on('disconnect', () => {
        console.log('Coder left:', socket.id);
    });
});

const PORT = process.env.PORT || 3001; 
server.listen(PORT, () => {
    console.log(`devlife server runs ${PORT}`);
    console.log('ghost stalking coder');
});
