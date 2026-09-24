const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Servir arquivos estáticos (HTML, CSS) da pasta atual
app.use(express.static(path.join(__dirname, 'public')));

// Inicializa o Banco de Dados SQLite
const db = new sqlite3.Database('./ecorotas.db', (err) => {
    if (err) console.error('Erro ao conectar ao banco:', err.message);
    else console.log('Conectado ao banco de dados SQLite.');
});

// Cria a tabela de usuários se não existir
db.run(`CREATE TABLE IF NOT EXISTS users (
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

        db.run(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, [ email, hash], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'E-mail já cadastrado.' });
                }
                return res.status(500).json({ error: 'Erro no servidor.' });
            }
            res.status(201).json({ message: 'Conta criada com sucesso!', userId : this .lastID,   email });
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao processar a senha.' });
    }
});

// ROTA DA API: Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Erro no servidor.' });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Senha incorreta.' });

        res.status(200).json({ 
            message: 'Login realizado com sucesso!', 
            user: { email: user.email, createdAt: user.created_at } 
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT} - Acesse http://localhost:${PORT}`));