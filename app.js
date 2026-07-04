import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import multer from "multer";

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Multer for file uploads ──────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "uploads")),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// Create uploads directory
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ─── Load .env ─────────────────────────────────────────────────
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach(line => {
    const [key, ...val] = line.trim().split("=");
    if (key && !key.startsWith("#") && val.length) {
      process.env[key.trim()] = val.join("=").trim();
    }
  });
}

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";
const PORT = process.env.PORT || 5004;

// ─── JSON Database ─────────────────────────────────────────────
const DB = path.join(__dirname, "database.json");
if (!fs.existsSync(DB)) {
  fs.writeFileSync(DB, JSON.stringify({ 
    users: [], 
    sessions: [], 
    answers: [],
    cheating_incidents: [],
    resumes: []
  }, null, 2));
}
const readDB  = ()    => JSON.parse(fs.readFileSync(DB, "utf-8"));
const writeDB = (data) => fs.writeFileSync(DB, JSON.stringify(data, null, 2));

// ─── Serve Frontend ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "..", "frontend")));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "..", "frontend", "index.html")));

// ─── Gemini AI ─────────────────────────────────────────────────
async function askGemini(prompt) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:5004",
      "X-Title": "AI Mock Interview"
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    })
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// ─── FALLBACK QUESTIONS ────────────────────────────────────────
const APTITUDE_FALLBACK = {
  "Frontend Developer": [
    { question: "What is the box model in CSS?", options: ["Margin, Border, Padding, Content", "Only padding and margin", "Border and content only", "Margin only"], answer: 0 },
    { question: "What does DOM stand for?", options: ["Document Object Model", "Data Object Management", "Digital Optimization Method", "Document Orientation Mode"], answer: 0 },
    { question: "Which HTTP method is idempotent?", options: ["POST", "PUT", "PATCH", "All of the above"], answer: 1 },
    { question: "What is React's Virtual DOM?", options: ["A copy of the real DOM", "A faster version of DOM", "In-memory representation that syncs with real DOM", "A database"], answer: 2 },
    { question: "What is semantic HTML?", options: ["HTML with meaning", "HTML with styling", "HTML with JavaScript", "HTML without tags"], answer: 0 },
    { question: "What is CORS used for?", options: ["Cross-Origin Resource Sharing", "Cross-Object Rendering System", "Client-Origin Request Standard", "Content Origin Resource Sharing"], answer: 0 },
    { question: "What is event delegation?", options: ["Assigning events to child elements", "Using parent element to handle child events", "Removing events", "Creating custom events"], answer: 1 },
    { question: "What is the purpose of meta tags?", options: ["Styling", "Provide metadata about HTML document", "Run JavaScript", "Create links"], answer: 1 },
    { question: "What is responsive design?", options: ["Design that responds to clicks", "Design that adapts to screen sizes", "Design with animations", "Design with colors"], answer: 1 },
    { question: "What is the purpose of webpack?", options: ["Create websites", "Bundle JavaScript modules", "Style CSS", "Run tests"], answer: 1 }
  ]
};

const TECHNICAL_MCQ_FALLBACK = [
  { question: "Time complexity of binary search?", options: ["O(n)", "O(log n)", "O(n²)", "O(1)"], answer: 1 },
  { question: "Which data structure uses LIFO?", options: ["Queue", "Stack", "Tree", "Graph"], answer: 1 },
  { question: "What is recursion?", options: ["Function calling itself", "Loop", "Iteration", "Condition"], answer: 0 },
  { question: "What is Big O notation?", options: ["Algorithm efficiency", "Data structure", "Design pattern", "Testing method"], answer: 0 },
  { question: "What is a hash table?", options: ["Array", "Key-value store", "Tree", "Graph"], answer: 1 }
];

const CODING_FALLBACK = {
  "Frontend Developer": [
    { question: "Write a function to reverse a string", language: "javascript", testCases: [{ input: "hello", output: "olleh" }] },
    { question: "Create a function that checks if a number is even", language: "javascript", testCases: [{ input: 4, output: true }] },
    { question: "Write a function to find the largest number in an array", language: "javascript", testCases: [{ input: [1,5,3,9,2], output: 9 }] },
    { question: "Create a function to count vowels in a string", language: "javascript", testCases: [{ input: "hello", output: 2 }] },
    { question: "Write a function to remove duplicates from an array", language: "javascript", testCases: [{ input: [1,2,2,3,3], output: [1,2,3] }] }
  ]
};

const HR_QUESTIONS = [
  "Tell me about yourself and your background.",
  "What are your greatest strengths?",
  "What is your biggest weakness and how are you working on it?",
  "Why should we hire you for this position?",
  "Where do you see yourself in 5 years?",
  "Describe a challenging situation you faced and how you handled it.",
  "How do you handle stress and pressure?",
  "What motivates you in your work?",
  "Do you have any questions for us?"
];

// ─── REGISTER ──────────────────────────────────────────────────
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.json({ error: "All fields required." });
    if (password.length < 6) return res.json({ error: "Password must be 6+ chars." });

    const db = readDB();
    if (db.users.find(u => u.email === email.toLowerCase()))
      return res.json({ error: "Email already registered." });

    db.users.push({
      id: "u_" + Date.now(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: await bcrypt.hash(password, 10),
      created_at: new Date().toISOString()
    });
    writeDB(db);
    res.json({ message: "Account created! Please login." });
  } catch (e) { res.status(500).json({ error: "Registration failed." }); }
});

// ─── LOGIN ─────────────────────────────────────────────────────
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ error: "Email and password required." });

    const db = readDB();
    const user = db.users.find(u => u.email === email.toLowerCase().trim());
    if (!user) return res.json({ error: "Email not found." });
    if (!await bcrypt.compare(password, user.password))
      return res.json({ error: "Wrong password." });

    res.json({ userId: user.id, name: user.name, email: user.email });
  } catch (e) { res.status(500).json({ error: "Login failed." }); }
});

// ─── UPLOAD RESUME ─────────────────────────────────────────────
app.post("/api/upload-resume", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    const userId = req.body.userId;
    const fileName = req.file.filename;
    const filePath = req.file.path;

    // Extract text from resume (simplified - in production use pdf-parse or similar)
    let extractedText = "Sample resume text for AI analysis";
    
    // Analyze resume with AI
    let analysis = {
      role: "Frontend Developer",
      domain: "Web Development",
      skills: ["JavaScript", "React", "CSS"],
      experience: "2-3 years",
      summary: "Experienced frontend developer with strong React skills"
    };

    if (OPENROUTER_KEY) {
      try {
        const prompt = `Analyze this resume and extract: role, domain, skills (array), experience level, brief summary.
Resume text: ${extractedText}
Return only valid JSON with keys: role, domain, skills, experience, summary`;
        
        const rawAnalysis = await askGemini(prompt);
        const cleaned = rawAnalysis.replace(/```json|```/g, "").trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) analysis = JSON.parse(match[0]);
      } catch (e) {
        console.log("AI analysis failed, using defaults");
      }
    }

    // Save to database
    const db = readDB();
    db.resumes.push({
      id: "r_" + Date.now(),
      userId,
      fileName,
      filePath,
      analysis,
      uploadedAt: new Date().toISOString()
    });
    writeDB(db);

    console.log(`✅ Resume uploaded and analyzed for user ${userId}`);
    res.json({ 
      message: "Resume uploaded successfully", 
      analysis 
    });
  } catch (e) {
    console.error("Resume upload error:", e);
    res.status(500).json({ error: "Upload failed" });
  }
});

// ─── GENERATE QUESTIONS ────────────────────────────────────────
app.post("/api/generate-questions", async (req, res) => {
  const { round = "aptitude", role = "Frontend Developer", domain = "Web Development" } = req.body;
  console.log(`📝 Generating ${round} questions for: ${role}`);

  // APTITUDE ROUND
  if (round === "aptitude") {
    const questions = APTITUDE_FALLBACK[role] || APTITUDE_FALLBACK["Frontend Developer"];
    return res.json({ questions, source: "fallback", type: "mcq" });
  }

  // TECHNICAL MCQ
  if (round === "technical_mcq") {
    return res.json({ questions: TECHNICAL_MCQ_FALLBACK, source: "fallback", type: "mcq" });
  }

  // TECHNICAL CODING
  if (round === "technical_coding") {
    const questions = CODING_FALLBACK[role] || CODING_FALLBACK["Frontend Developer"];
    return res.json({ questions, source: "fallback", type: "coding" });
  }

  // HR QUESTIONS
  if (round === "hr") {
    return res.json({ questions: HR_QUESTIONS, source: "fallback", type: "conversation" });
  }

  res.json({ questions: [], error: "Unknown round type" });
});

// ─── EVALUATE CODE ─────────────────────────────────────────────
app.post("/api/evaluate-code", async (req, res) => {
  try {
    const { code } = req.body;
    let score = 0;
    if (code.length > 10) score += 3;
    if (code.includes("function") || code.includes("def")) score += 2;
    if (code.includes("return")) score += 2;
    if (code.length > 50) score += 3;

    const feedback = score >= 7 ? "Good solution!" : score >= 5 ? "Decent attempt." : "Needs more work.";
    res.json({ passed: score >= 5, score: Math.min(score, 10), feedback, output: "Code evaluated" });
  } catch (e) {
    res.json({ passed: false, score: 0, feedback: "Error", output: e.message });
  }
});

// ─── HR RESPONSE ───────────────────────────────────────────────
app.post("/api/hr-response", async (req, res) => {
  try {
    const { answer } = req.body;
    let score = 0;
    if (answer.length > 30) score += 3;
    if (answer.length > 80) score += 3;
    if (/experience|skills|team|project|learn/i.test(answer)) score += 4;
    
    const feedback = score >= 8 ? "⭐ Excellent answer!" : score >= 5 ? "👍 Good response." : "💡 Try to elaborate more.";
    res.json({ score: Math.min(score, 10), feedback });
  } catch (e) {
    res.json({ score: 0, feedback: "Error" });
  }
});

// ─── SAVE SESSION ──────────────────────────────────────────────
app.post("/api/save-session", (req, res) => {
  try {
    const { userId, role, domain, round, mcqScore, codingScore, hrScore, totalQuestions, answers, cheatingFlags } = req.body;

    const db = readDB();
    const avgScore = round === "technical" 
      ? parseFloat(((mcqScore || 0) + (codingScore || 0)) / 2)
      : mcqScore || hrScore || 0;

    const session = {
      id: "s_" + Date.now(),
      userId, role, domain, round,
      avgScore: parseFloat(avgScore.toFixed(1)),
      mcqScore: mcqScore || 0,
      codingScore: codingScore || 0,
      hrScore: hrScore || 0,
      totalQuestions,
      answers: answers || [],
      cheatingFlags: cheatingFlags || [],
      date: new Date().toISOString()
    };

    db.sessions.push(session);

    if (cheatingFlags && cheatingFlags.length > 0) {
      cheatingFlags.forEach(flag => {
        db.cheating_incidents.push({
          userId, sessionId: session.id, type: flag.type,
          timestamp: flag.timestamp || new Date().toISOString(), details: flag
        });
      });
    }

    writeDB(db);
    console.log(`✅ Session saved: ${round} (score: ${avgScore})`);
    res.json({ message: "Session saved", sessionId: session.id });
  } catch (e) {
    console.error("Save error:", e);
    res.status(500).json({ error: "Failed to save" });
  }
});

// ─── GET HISTORY ───────────────────────────────────────────────
app.get("/api/history/:userId", (req, res) => {
  const db = readDB();
  const sessions = db.sessions
    .filter(s => s.userId === req.params.userId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(sessions);
});

// ─── GET ANALYTICS ─────────────────────────────────────────────
app.get("/api/analytics/:userId", (req, res) => {
  const db = readDB();
  const sessions = db.sessions.filter(s => s.userId === req.params.userId);
  
  const aptitude = sessions.filter(s => s.round === "aptitude").map(s => s.avgScore);
  const technical = sessions.filter(s => s.round === "technical").map(s => s.avgScore);
  const hr = sessions.filter(s => s.round === "hr").map(s => s.avgScore);
  
  const overall = sessions.length 
    ? sessions.reduce((sum, s) => sum + s.avgScore, 0) / sessions.length 
    : 0;

  res.json({ aptitude, technical, hr, overall });
});

// ─── START SERVER ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(OPENROUTER_KEY ? "✅ Gemini API enabled" : "⚠️  Using fallback questions");
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`⚠️  Port ${PORT} busy, trying ${PORT + 1}...`);
    app.listen(PORT + 1, () => console.log(`🚀 Server on http://localhost:${PORT + 1}`));
  }
});
