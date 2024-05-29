// Import required libraries
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const http = require('http');
const socketIO = require('socket.io');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');

// Create express app and server
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Set the template engine
app.set('view engine', 'hbs');

// Load environment variables
dotenv.config({ path: "./.env" });

// Setup MySQL database connection
const db = mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE
});

// Connect to the database
db.connect((error) => {
    if (error) {
        console.error("Error connecting to MySQL database:", error);
    } else {
        console.log("Connected to MySQL database");
    }
});

// Middleware to handle data parsing
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'webbsidan')));
app.use(bodyParser.urlencoded({ extended: false }));

// Configure session management
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
}));

// Route to render the home page
app.get("/", (req, res) => {
    res.render("index");
});

// Route to render the registration page
app.get("/register", (req, res) => {
    res.render("register");
});

// Route to render the login page
app.get("/login", (req, res) => {
    res.render("login");
});

// Function to validate email format
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; 
    return emailRegex.test(email);
}

// Function to check password requirements
function CheckPassword(password) { 
    var passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*]).{8,}$/;
    return passwordRegex.test(password);
}

// Route to handle user registration
app.post("/auth/register", async (req, res) => {    
    const { name, email, password, password_confirm } = req.body;

    if (!name || !email || !password || !password_confirm) {
        return res.render('register', { message: 'Vänligen fyll i alla fält' });
    }

    if (password !== password_confirm) {
        return res.render('register', { message: 'Lösenorden matchar inte' });
    }

    if (!CheckPassword(password)) { 
        return res.render('register', { message: 'Lösenord måste vara minst 8 tecken eller ha specialtecken' });
    }

    if (!validateEmail(email)) {
        return res.render('register', { message: 'Ogiltig e-postadress' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.query('SELECT * FROM konto WHERE name = ? OR email = ?', [name, email], (err, result) => {
        if (err) {
            console.error(err);
            return res.render('register', { message: 'Något gick fel vid registrering' });
        }
        
        if (result.length > 0) {
            return res.render('register', { message: 'Namn eller Epost redan existerar' });
        }

        db.query('INSERT INTO konto SET ?', { name: name, email: email, password: hashedPassword }, (err, result) => {
            if (err) {
                console.error(err);
                return res.render('register', { message: 'Något gick fel vid registrering' });
            } else {
                console.log("Användare registrerad");
                return res.render('register', { message: 'Användare registrerad' });
            }       
        });
    });
});

// Route to handle user login
app.post("/auth/login", (req, res) => {   
    const { name, password } = req.body;

    db.query('SELECT userID, name, password FROM konto WHERE name = ?', [name], async (error, result) => {
        if (error) {
            console.error(error);
            return res.render('login', { message: "Något gick fel vid inloggning" });
        }
        
        if (result.length == 0) {
            return res.render('login', { message: "Användaren finns ej" });
        } else {
            const match = await bcrypt.compare(password, result[0].password);
            if (match) {
                req.session.userID = result[0].userID; // Store userID in session
                req.session.userName = result[0].name; // Store userName in session
                console.log("You have logged in!");
                return res.redirect('/chat.html');
            } else {
                return res.render('login', { message: "Fel lösenord" });
            }
        }
    });
});

// Route to get messages from the database
app.get("/message", (req, res) => {
    db.query(`
        SELECT chat.chatID, chat.message, konto.name FROM chat 
        JOIN konto ON chat.userID = konto.userID
    `, (error, results) => {
        if (error) {
            console.error("Error fetching messages from database:", error);
            res.sendStatus(500);
        } else {
            res.send(results);
        }
    });
});

// Route to save a new message to the database
app.post("/message", (req, res) => {
    const { message } = req.body;
    const userID = req.session.userID; // Get userID from session

    if (!userID) {
        return res.sendStatus(401); // Unauthorized if userID is not found in session
    }

    const insertQuery = "INSERT INTO chat (userID, message) VALUES (?, ?)";
    db.query(insertQuery, [userID, message], (error, result) => {
        if (error) {
            console.error("Error saving message to database:", error);
            res.sendStatus(500);
        } else {
            io.emit("message", { name: req.session.userName, message }); // Include 'name' property
            res.sendStatus(200);
        }
    });
});

// Route to delete a message from the database
app.post("/message/delete", (req, res) => {
    const { messageID } = req.body;
    const deleteQuery = "DELETE FROM chat WHERE chatID = ?";
    db.query(deleteQuery, [messageID], (error, result) => {
        if (error) {
            console.error("Error deleting message:", error);
            res.sendStatus(500);
        } else {
            io.emit("messageDeleted", messageID); // Notify clients that the message was deleted
            res.sendStatus(200);
        }
    });
});

// Route to get user profile information
app.get("/profile", (req, res) => {
    if (!req.session.userID) {
        return res.redirect("/login");
    }

    db.query('SELECT name, email FROM konto WHERE userID = ?', [req.session.userID], (error, results) => {
        if (error) {
            console.error("Error fetching profile information:", error);
            return res.sendStatus(500);
        }

        if (results.length === 0) {
            return res.redirect("/login");
        }

        res.render("profile", { name: results[0].name, email: results[0].email });
    });
});

// Route to update user profile information
app.post("/profile/update", (req, res) => {
    const { name, email } = req.body;
    const userID = req.session.userID;

    if (!validateEmail(email)) {
        return res.render("profile", { message: "Ogiltig e-postadress", name: req.body.name, email: req.body.email });
    }

    db.query('UPDATE konto SET name = ?, email = ? WHERE userID = ?', [name, email, userID], (error, results) => {
        if (error) {
            console.error("Error updating profile information:", error);
            return res.sendStatus(500).send("Failed to update profile");
        }
        res.render("profile", { message: "Profil uppdaterad", name: name, email: email });
    });
});

// Route to handle user logout
app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error logging out:", err);
            return res.redirect("/chat.html");
        }
        res.redirect("/login");
    });
});

// Route to delete a specific message
app.delete('/message/:id', (req, res) => {
    const messageId = req.params.id;
    const deleteQuery = 'DELETE FROM messages WHERE id = ?';

    db.query(deleteQuery, [messageId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err });
        }
        res.status(200).json({ message: 'Message deleted successfully' });
    });
});

// Socket.io connection event
io.on("connection", (socket) => {
    console.log("A user connected");
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running, visit http://localhost:${PORT}`);
});
