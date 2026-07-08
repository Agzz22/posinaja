import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// === KONEKSI KE SUPABASE ===
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Pakai Service Role Key untuk backend
const supabase = createClient(supabaseUrl, supabaseKey);
const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_dasar_tapi_ganti_nanti';

// === MIDDLEWARE AUTH (Verifikasi Token) ===
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token tidak ditemukan' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid' });
  }
};

// ==========================================
// 1. AUTHENTIKASI (LOGIN & REGISTER)
// ==========================================

// Register (buat akun)
app.post('/api/register', async (req, res) => {
  const { username, password, nama_lengkap, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib' });

  const hashed = bcrypt.hashSync(password, 10);
  const { data, error } = await supabase
    .from('users')
    .insert([{ username, password_hash: hashed, nama_lengkap, role: role || 'kasir' }])
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Akun berhasil dibuat', data });
});

// Login (dengan PIN/Password)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username);

  if (error || users.length === 0) return res.status(401).json({ error: 'User tidak ditemukan' });

  const user = users[0];
  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) return res.status(401).json({ error: 'Password salah' });

  const token = jwt.sign({ id: user.id, role: user.role, nama: user.nama_lengkap }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, nama: user.nama_lengkap } });
});

// ==========================================
// 2. MANAJEMEN PRODUK (CRUD)
// ==========================================

app.get('/api/products', authenticate, async (req, res) => {
  const { data, error } = await supabase.from('products').select('*, suppliers(nama)');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/products', authenticate, async (req, res) => {
  const { nama, kategori, satuan, hpp, harga_jual, stok, stok_minimum, supplier_id } = req.body;
  const { data, error } = await supabase
    .from('products')
    .insert([{ nama, kategori, satuan, hpp, harga_jual, stok, stok_minimum, supplier_id }])
    .select();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.put('/api/products/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { nama, kategori, satuan, hpp, harga_jual, stok, stok_minimum, supplier_id } = req.body;
  const { data, error } = await supabase
    .from('products')
    .update({ nama, kategori, satuan, hpp, harga_jual, stok, stok_minimum, supplier_id })
    .eq('id', id)
    .select();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.delete('/api/products/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Produk terhapus' });
});

// ==========================================
// 3. TRANSAKSI (JUALAN)
// ==========================================

app.post('/api/transactions', authenticate, async (req, res) => {
  const { customer_name, items, metode_bayar, total_belanja, total_hpp } = req.body;
  const user_id = req.user.id;

  // 1. Insert ke transactions
  const { data: transData, error: transError } = await supabase
    .from('transactions')
    .insert([{ user_id, customer_name, total_belanja, total_hpp, metode_bayar }])
    .select();
  if (transError) return res.status(400).json({ error: transError.message });
  const transaction_id = transData[0].id;

  // 2. Insert details & Kurangi stok
  for (let item of items) {
    // Insert detail
    await supabase.from('transaction_details').insert([{
      transaction_id,
      product_id: item.product_id,
      qty: item.qty,
      harga_satuan_jual: item.harga_satuan_jual,
      hpp_satuan: item.hpp_satuan,
      subtotal: item.subtotal
    }]);

    // Kurangi stok
    const { data: product } = await supabase.from('products').select('stok').eq('id', item.product_id);
    if (product) {
      const newStok = product[0].stok - item.qty;
      await supabase.from('products').update({ stok: newStok }).eq('id', item.product_id);
    }
  }

  res.json({ message: 'Transaksi sukses', transaction_id });
});

// ==========================================
// 4. DASHBOARD & RIWAYAT
// ==========================================

app.get('/api/dashboard', authenticate, async (req, res) => {
  // Hitung omset hari ini
  const today = new Date().toISOString().split('T')[0];
  const { data: transToday, error } = await supabase
    .from('transactions')
    .select('total_belanja')
    .gte('created_at', today);

  if (error) return res.status(500).json({ error: error.message });

  const totalOmset = transToday?.reduce((sum, t) => sum + t.total_belanja, 0) || 0;
  const jumlahTransaksi = transToday?.length || 0;

  // Cek stok menipis
  const { data: lowStock } = await supabase
    .from('products')
    .select('nama, stok')
    .lt('stok', supabase.rpc('min', { a: 'stok_minimum' }));

  res.json({ omset: totalOmset, jumlah_transaksi: jumlahTransaksi, stok_menipis: lowStock || [] });
});

// ==========================================
// 5. HUTANG (DEBT)
// ==========================================

app.get('/api/debts', authenticate, async (req, res) => {
  const { data, error } = await supabase.from('debts').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/debts', authenticate, async (req, res) => {
  const { customer_name, phone, total_hutang, jatuh_tempo } = req.body;
  const { data, error } = await supabase
    .from('debts')
    .insert([{ customer_name, phone, total_hutang, sisa_hutang: total_hutang, jatuh_tempo }])
    .select();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.put('/api/debts/pay/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { nominal_bayar } = req.body;

  const { data: debtData, error: fetchError } = await supabase.from('debts').select('sisa_hutang').eq('id', id);
  if (fetchError) return res.status(500).json({ error: fetchError.message });
  
  const currentSisa = debtData[0].sisa_hutang;
  const newSisa = currentSisa - nominal_bayar;
  const status = newSisa <= 0 ? 'lunas' : 'belum_lunas';
  const finalSisa = newSisa < 0 ? 0 : newSisa;

  const { data, error } = await supabase
    .from('debts')
    .update({ sisa_hutang: finalSisa, status })
    .eq('id', id)
    .select();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ==========================================
// 6. PENGELUARAN (EXPENSES)
// ==========================================

app.post('/api/expenses', authenticate, async (req, res) => {
  const { kategori, nominal, deskripsi } = req.body;
  const { data, error } = await supabase
    .from('expenses')
    .insert([{ user_id: req.user.id, kategori, nominal, deskripsi }])
    .select();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ==========================================
// JALANKAN SERVER
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend Toko Umi berjalan di port ${PORT}`);
});