const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Servir arquivos estáticos (HTML, CSS) da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Segredo usado para assinar os tokens de sessão (defina JWT_SECRET nas
// variáveis de ambiente do Render em produção; este valor só é usado como
// fallback local).
const JWT_SECRET = process.env.JWT_SECRET || 'ecorotas-dev-secret-troque-em-producao';

// Inicializa o Banco de Dados SQLite
const db = new Database(path.join(__dirname, 'ecorotas.db'));
console.log('Conectado ao banco de dados SQLite.');

// Cria as tabelas se não existirem
db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_email TEXT NOT NULL,
    author_name TEXT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Migração defensiva: caso o banco já exista de uma versão anterior (sem as
// colunas novas), adiciona o que faltar sem apagar os dados existentes.
function ensureColumn(table, column, definition) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}
ensureColumn('users', 'name', 'TEXT');
ensureColumn('posts', 'author_name', 'TEXT');

// Middleware: exige um token válido (Authorization: Bearer <token>)
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'É preciso estar logado para fazer isso.' });
    }

    try {
        req.user = jwt.verify(token, JWT_SECRET); // { email, name }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
}

// ROTA DA API: Cadastro (Register)
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!email || !password || password.length < 8) {
        return res.status(400).json({ error: 'Dados inválidos.' });
    }

    try {
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);
        const cleanName = (name || '').trim() || null;

        const stmt = db.prepare(`INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)`);
        const info = stmt.run(cleanName, email, hash);

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

        // Quem se cadastrou antes do campo "nome" existir não tem nome salvo;
        // nesse caso usamos a parte antes do @ do e-mail como alternativa.
        const displayName = (user.name && user.name.trim()) || user.email.split('@')[0];

        const token = jwt.sign({ email: user.email, name: displayName }, JWT_SECRET, { expiresIn: '7d' });

        res.status(200).json({
            message: 'Login realizado com sucesso!',
            token,
            user: { email: user.email, name: displayName, createdAt: user.created_at }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

// ROTA DA API: Listar posts da comunidade (pública, não precisa estar logado pra ler)
app.get('/api/posts', (req, res) => {
    try {
        const posts = db.prepare(`SELECT id, author_email, author_name, content, created_at FROM posts ORDER BY created_at DESC LIMIT 100`).all();
        res.status(200).json({ posts });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

// ROTA DA API: Criar post na comunidade (precisa estar logado)
app.post('/api/posts', requireAuth, (req, res) => {
    const { content } = req.body;

    if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Escreva algo antes de publicar.' });
    }
    if (content.length > 500) {
        return res.status(400).json({ error: 'Máximo de 500 caracteres.' });
    }

    try {
        const stmt = db.prepare(`INSERT INTO posts (author_email, author_name, content) VALUES (?, ?, ?)`);
        const info = stmt.run(req.user.email, req.user.name, content.trim());
        const post = db.prepare(`SELECT id, author_email, author_name, content, created_at FROM posts WHERE id = ?`).get(info.lastInsertRowid);
        res.status(201).json({ post });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

// ROTA DA API: Apagar post (só o próprio autor pode apagar)
app.delete('/api/posts/:id', requireAuth, (req, res) => {
    try {
        const post = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
        if (post.author_email !== req.user.email) {
            return res.status(403).json({ error: 'Você só pode apagar suas próprias publicações.' });
        }
        db.prepare(`DELETE FROM posts WHERE id = ?`).run(req.params.id);
        res.status(200).json({ message: 'Post removido.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
