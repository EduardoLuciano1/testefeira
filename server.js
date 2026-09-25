const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Servir arquivos estáticos (HTML, CSS) da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Inicializa o Banco de Dados SQLite
const db = new Database(path.join(__dirname, 'ecorotas.db'));
console.log('Conectado ao banco de dados SQLite.');

// Cria a tabela de usuários se não existir
db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// ROTA DA API: Cadastro (Register)
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password || password.length < 8) {
        return res.status(400).json({ error: 'Dados inválidos.' });
    }

    try {
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);

        const stmt = db.prepare(`INSERT INTO users (email, password_hash) VALUES (?, ?)`);
        const info = stmt.run(email, hash);

        res.status(201).json({ message: 'Conta criada com sucesso!', userId: info.lastInsertRowid, email });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || (err.message && err.message.includes('UNIQUE constraint failed'))) {
            return res.status(409).json({ error: 'E-mail já cadastrado.' });
        }
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

// ROTA DA API: Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Senha incorreta.' });

        res.status(200).json({
            message: 'Login realizado com sucesso!',
            user: { email: user.email, createdAt: user.created_at }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
