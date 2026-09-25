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

db.exec(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_email TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_email)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
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

// Middleware: se houver um token válido no header, identifica o usuário,
// mas nunca bloqueia a requisição (usado em rotas públicas que precisam
// saber "isso aqui é meu?" sem exigir login).
function optionalAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
        try {
            req.user = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            // token inválido/expirado: segue sem usuário logado
        }
    }
    next();
}

// ROTA DA API: Listar posts da comunidade (pública, não precisa estar logado pra ler)
app.get('/api/posts', optionalAuth, (req, res) => {
    try {
        const posts = db.prepare(`SELECT id, author_email, author_name, content, created_at FROM posts ORDER BY created_at DESC LIMIT 100`).all();

        const likeCountStmt = db.prepare(`SELECT COUNT(*) AS n FROM likes WHERE post_id = ?`);
        const likedByMeStmt = db.prepare(`SELECT 1 FROM likes WHERE post_id = ? AND user_email = ?`);
        const commentCountStmt = db.prepare(`SELECT COUNT(*) AS n FROM comments WHERE post_id = ?`);

        const enriched = posts.map(p => ({
            ...p,
            like_count: likeCountStmt.get(p.id).n,
            liked_by_me: req.user ? !!likedByMeStmt.get(p.id, req.user.email) : false,
            comment_count: commentCountStmt.get(p.id).n,
        }));

        res.status(200).json({ posts: enriched });
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
        // Remove também curtidas e comentários ligados ao post.
        db.prepare(`DELETE FROM likes WHERE post_id = ?`).run(req.params.id);
        db.prepare(`DELETE FROM comments WHERE post_id = ?`).run(req.params.id);
        db.prepare(`DELETE FROM posts WHERE id = ?`).run(req.params.id);
        res.status(200).json({ message: 'Post removido.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

// ROTA DA API: Curtir/descurtir um post (alterna; precisa estar logado)
app.post('/api/posts/:id/like', requireAuth, (req, res) => {
    try {
        const post = db.prepare(`SELECT id FROM posts WHERE id = ?`).get(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post não encontrado.' });

        const existing = db.prepare(`SELECT id FROM likes WHERE post_id = ? AND user_email = ?`).get(req.params.id, req.user.email);
        let liked;
        if (existing) {
            db.prepare(`DELETE FROM likes WHERE id = ?`).run(existing.id);
            liked = false;
        } else {
            db.prepare(`INSERT INTO likes (post_id, user_email) VALUES (?, ?)`).run(req.params.id, req.user.email);
            liked = true;
        }
        const likeCount = db.prepare(`SELECT COUNT(*) AS n FROM likes WHERE post_id = ?`).get(req.params.id).n;
        res.status(200).json({ liked, likeCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

// ROTA DA API: Listar respostas (comentários) de um post (pública)
app.get('/api/posts/:id/comments', (req, res) => {
    try {
        const comments = db.prepare(
            `SELECT id, post_id, author_email, author_name, content, created_at FROM comments WHERE post_id = ? ORDER BY created_at ASC`
        ).all(req.params.id);
        res.status(200).json({ comments });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

// ROTA DA API: Responder a um post (precisa estar logado)
app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
    const { content } = req.body;

    if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Escreva algo antes de responder.' });
    }
    if (content.length > 300) {
        return res.status(400).json({ error: 'Máximo de 300 caracteres.' });
    }

    try {
        const post = db.prepare(`SELECT id FROM posts WHERE id = ?`).get(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post não encontrado.' });

        const stmt = db.prepare(`INSERT INTO comments (post_id, author_email, author_name, content) VALUES (?, ?, ?, ?)`);
        const info = stmt.run(req.params.id, req.user.email, req.user.name, content.trim());
        const comment = db.prepare(`SELECT id, post_id, author_email, author_name, content, created_at FROM comments WHERE id = ?`).get(info.lastInsertRowid);
        res.status(201).json({ comment });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

// ROTA DA API: Apagar uma resposta (só o próprio autor pode apagar)
app.delete('/api/comments/:id', requireAuth, (req, res) => {
    try {
        const comment = db.prepare(`SELECT * FROM comments WHERE id = ?`).get(req.params.id);
        if (!comment) return res.status(404).json({ error: 'Resposta não encontrada.' });
        if (comment.author_email !== req.user.email) {
            return res.status(403).json({ error: 'Você só pode apagar suas próprias respostas.' });
        }
        db.prepare(`DELETE FROM comments WHERE id = ?`).run(req.params.id);
        res.status(200).json({ message: 'Resposta removida.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
