
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET_IN_PRODUCTION";
const db = new Database(process.env.DB_PATH || path.join(__dirname, "naijapay.db"));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  wallet_id TEXT NOT NULL UNIQUE,
  balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

const bankDetails = {
  accountName: "Abdul Musa",
  bankName: "Moniepoint Microfinance Bank",
  accountNumber: "7061604943"
};

function tokenFor(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return res.status(401).json({error:"Authentication required"});
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({error:"Session expired or invalid"});
  }
}
function getUser(id) {
  return db.prepare("SELECT id,full_name,email,phone,wallet_id,balance,created_at FROM users WHERE id=?").get(id);
}

app.get("/api/health", (req,res)=>res.json({ok:true}));

app.post("/api/register", async (req,res)=>{
  try {
    const {fullName,email,phone,password} = req.body;
    if (!fullName || !email || !password || password.length < 6)
      return res.status(400).json({error:"Full name, email and a password of at least 6 characters are required."});
    const normalized = email.trim().toLowerCase();
    if (db.prepare("SELECT id FROM users WHERE email=?").get(normalized))
      return res.status(409).json({error:"An account with that email already exists."});
    const hash = await bcrypt.hash(password, 12);
    const walletId = "NP-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const info = db.prepare("INSERT INTO users(full_name,email,phone,password_hash,wallet_id) VALUES(?,?,?,?,?)")
      .run(fullName.trim(), normalized, phone || "", hash, walletId);
    const user = getUser(info.lastInsertRowid);
    res.json({token:tokenFor(user), user});
  } catch(e) { res.status(500).json({error:"Registration failed"}); }
});

app.post("/api/login", async (req,res)=>{
  const {email,password} = req.body;
  const row = db.prepare("SELECT * FROM users WHERE email=?").get((email||"").trim().toLowerCase());
  if (!row || !(await bcrypt.compare(password||"", row.password_hash)))
    return res.status(401).json({error:"Invalid email or password"});
  const user = getUser(row.id);
  res.json({token:tokenFor(user), user});
});

app.get("/api/me", auth, (req,res)=>{
  const user=getUser(req.user.id);
  if(!user) return res.status(404).json({error:"User not found"});
  res.json({user, bankDetails});
});

app.get("/api/deposit-details", auth, (req,res)=>res.json({bankDetails}));

app.post("/api/deposits", auth, (req,res)=>{
  const amount=Number(req.body.amount);
  const reference=(req.body.reference||"").trim();
  if(!Number.isFinite(amount) || amount<=0 || !reference)
    return res.status(400).json({error:"Enter a valid amount and payment reference."});
  const exists=db.prepare("SELECT id FROM deposits WHERE reference=?").get(reference);
  if(exists) return res.status(409).json({error:"That payment reference has already been submitted."});
  const info=db.prepare("INSERT INTO deposits(user_id,amount,reference) VALUES(?,?,?)").run(req.user.id,amount,reference);
  db.prepare("INSERT INTO transactions(user_id,type,amount,status,description) VALUES(?,?,?,?,?)")
    .run(req.user.id,"deposit",amount,"pending","Deposit submitted for verification");
  res.json({message:"Deposit submitted for verification.", depositId:info.lastInsertRowid});
});

app.post("/api/withdrawals", auth, (req,res)=>{
  const amount=Number(req.body.amount);
  const {bankName,accountName,accountNumber}=req.body;
  if(!Number.isFinite(amount) || amount<=0 || !bankName || !accountName || !accountNumber)
    return res.status(400).json({error:"Complete all withdrawal fields."});
  const result=db.transaction(()=>{
    const user=db.prepare("SELECT balance FROM users WHERE id=?").get(req.user.id);
    if(user.balance < amount) throw new Error("Insufficient wallet balance.");
    db.prepare("UPDATE users SET balance=balance-? WHERE id=?").run(amount,req.user.id);
    const info=db.prepare("INSERT INTO withdrawals(user_id,amount,bank_name,account_name,account_number) VALUES(?,?,?,?,?)")
      .run(req.user.id,amount,bankName,accountName,accountNumber);
    db.prepare("INSERT INTO transactions(user_id,type,amount,status,description) VALUES(?,?,?,?,?)")
      .run(req.user.id,"withdrawal",amount,"pending","Withdrawal requested");
    return info.lastInsertRowid;
  })();
  res.json({message:"Withdrawal request submitted for review.",withdrawalId:result});
});

app.get("/api/transactions", auth, (req,res)=>{
  const rows=db.prepare("SELECT id,type,amount,status,description,created_at FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 50").all(req.user.id);
  res.json({transactions:rows});
});

/* Admin endpoints: protect these with a separate admin system before production. */
app.post("/api/admin/deposits/:id/approve", (req,res)=>{
  const deposit=db.prepare("SELECT * FROM deposits WHERE id=?").get(req.params.id);
  if(!deposit || deposit.status!=="pending") return res.status(404).json({error:"Pending deposit not found"});
  db.transaction(()=>{
    db.prepare("UPDATE deposits SET status='approved' WHERE id=?").run(deposit.id);
    db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(deposit.amount,deposit.user_id);
    db.prepare("UPDATE transactions SET status='approved' WHERE user_id=? AND type='deposit' AND amount=? AND status='pending' ORDER BY id DESC LIMIT 1")
      .run(deposit.user_id,deposit.amount);
  })();
  res.json({message:"Deposit approved"});
});

app.listen(PORT,()=>console.log(`NaijaPay running on port ${PORT}`));
