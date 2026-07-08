import React, { useState, useEffect } from 'react';
import axios from 'axios';

// ========== KOMPONEN LOGIN ==========
function Login({ setToken, setUser }) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      const res = await axios.post('/api/login', { username, password: pin });
      setToken(res.data.token);
      setUser(res.data.user);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setError('');
    } catch (err) {
      setError('Username atau PIN salah!');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm">
        <h1 className="text-3xl font-bold text-green-700 text-center">🥬 TOKO UMI</h1>
        <p className="text-center text-gray-500 mb-6">Masukkan PIN</p>
        {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-4 text-center">{error}</div>}
        <select className="select select-bordered w-full mb-4 text-lg h-14" value={username} onChange={(e) => setUsername(e.target.value)}>
          <option value="">Pilih Nama</option>
          <option value="admin">Ibu Yuyun (Admin)</option>
          <option value="kasir">Anak (Kasir)</option>
        </select>
        <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} className="btn btn-outline btn-lg text-2xl" onClick={() => setPin(prev => prev + n)}>{n}</button>
          ))}
          <button className="btn btn-outline btn-lg text-xl" onClick={() => setPin('')}>Clear</button>
          <button className="btn btn-outline btn-lg text-xl">0</button>
          <button className="btn btn-success btn-lg text-xl text-white" onClick={handleLogin}>✔</button>
        </div>
        <div className="mt-4 text-center text-2xl tracking-widest bg-gray-100 p-2 rounded">
          {pin.replace(/./g, '*')}
        </div>
      </div>
    </div>
  );
}

// ========== KOMPONEN DASHBOARD ==========
function Dashboard({ user, setToken, setUser }) {
  const [data, setData] = useState({ omset: 0, jumlah_transaksi: 0, stok_menipis: [] });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('/api/dashboard');
        setData(res.data);
      } catch (e) { console.log(e); }
    };
    fetchData();
  }, []);

  const logout = () => {
    localStorage.clear();
    setToken(null);
    setUser(null);
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">👋 Halo, {user?.nama || user?.username}</h1>
        <button onClick={logout} className="btn btn-sm btn-error text-white">Logout</button>
      </div>
      <div className="bg-green-100 p-6 rounded-2xl shadow mb-4">
        <p className="text-sm text-gray-600">Omset Hari Ini</p>
        <p className="text-4xl font-bold text-green-800">Rp {data.omset?.toLocaleString() || 0}</p>
        <p className="text-sm">{data.jumlah_transaksi} Transaksi</p>
      </div>
      <div className="bg-yellow-100 p-4 rounded-2xl mb-4">
        <p className="font-bold">⚠️ Stok Menipis</p>
        {data.stok_menipis?.length === 0 ? <p className="text-sm">Semua aman</p> : data.stok_menipis?.map((item, i) => <p key={i}>- {item.nama} (sisa {item.stok})</p>)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <button className="btn btn-success btn-lg text-white text-xl" onClick={() => window.location.href = '/transaksi'}>🛒 JUALAN</button>
        <button className="btn btn-warning btn-lg">📋 Hutang</button>
      </div>
    </div>
  );
}

// ========== KOMPONEN TRANSAKSI (INTI) ==========
function Transaksi() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [uangBayar, setUangBayar] = useState(0);
  const [kembalian, setKembalian] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [qty, setQty] = useState(1);

  // Ambil daftar produk
  useEffect(() => {
    axios.get('/api/products').then(res => setProducts(res.data));
  }, []);

  // Update total setiap cart berubah
  useEffect(() => {
    const sum = cart.reduce((acc, item) => acc + item.subtotal, 0);
    setTotal(sum);
  }, [cart]);

  // Tambah ke keranjang
  const addToCart = () => {
    if (!selectedProduct) return;
    const hargaJual = selectedProduct.harga_jual;
    const hpp = selectedProduct.hpp;
    const subtotal = hargaJual * qty;
    setCart([...cart, {
      product_id: selectedProduct.id,
      nama: selectedProduct.nama,
      qty: qty,
      harga_satuan_jual: hargaJual,
      hpp_satuan: hpp,
      subtotal: subtotal
    }]);
    setSelectedProduct(null);
    setQty(1);
  };

  // Hapus dari keranjang
  const removeFromCart = (index) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  // Update harga (Tawar-menawar)
  const updatePrice = (index, newPrice) => {
    const newCart = [...cart];
    const item = newCart[index];
    const hpp = item.hpp_satuan;
    // Validasi HPP: Jika harga jual < HPP, warning akan muncul di UI
    item.harga_satuan_jual = Math.max(0, newPrice);
    item.subtotal = item.harga_satuan_jual * item.qty;
    setCart(newCart);
  };

  const handleBayar = async () => {
    if (cart.length === 0) return alert('Keranjang kosong!');
    const payload = {
      customer_name: 'Umum',
      items: cart,
      metode_bayar: 'tunai',
      total_belanja: total,
      total_hpp: cart.reduce((acc, i) => acc + (i.hpp_satuan * i.qty), 0)
    };
    try {
      await axios.post('/api/transactions', payload);
      alert('✅ Transaksi Berhasil!');
      setCart([]);
      setUangBayar(0);
      setKembalian(0);
    } catch (e) {
      alert('Gagal simpan transaksi!');
    }
  };

  const hitungKembalian = (uang) => {
    setUangBayar(uang);
    const kembali = uang - total;
    setKembalian(kembali > 0 ? kembali : 0);
  };

  return (
    <div className="p-4 max-w-md mx-auto h-screen flex flex-col">
      {/* Tombol Kembali */}
      <button className="btn btn-sm mb-2" onClick={() => window.location.href = '/'}>← Kembali</button>

      {/* ZONA 1: Grid Produk */}
      <div className="h-2/5 overflow-y-auto border-b-2 pb-2">
        <h2 className="font-bold text-lg">📦 Pilih Sayur</h2>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {products.map(p => (
            <button key={p.id} className="btn btn-outline h-20 flex flex-col items-center justify-center text-xs" onClick={() => setSelectedProduct(p)}>
              <span className="text-lg">🥬</span> {p.nama}
            </button>
          ))}
        </div>
        {selectedProduct && (
          <div className="mt-2 p-2 bg-blue-50 rounded flex gap-2 items-center">
            <span className="font-bold">{selectedProduct.nama}</span>
            <input type="number" className="input input-bordered input-sm w-20" value={qty} onChange={(e) => setQty(parseFloat(e.target.value) || 0)} step="0.1" />
            <button className="btn btn-primary btn-sm" onClick={addToCart}>+</button>
          </div>
        )}
      </div>

      {/* ZONA 2: Keranjang & Tawar */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-2 rounded my-2">
        <h3 className="font-bold">🛒 Keranjang</h3>
        {cart.map((item, idx) => {
          const isRugi = item.harga_satuan_jual < item.hpp_satuan;
          return (
            <div key={idx} className={`border-b p-2 ${isRugi ? 'bg-red-100 border-red-500' : ''}`}>
              <div className="flex justify-between items-center">
                <span className="font-bold">{item.nama}</span>
                <span>Rp {item.harga_satuan_jual} x {item.qty}</span>
                <button className="btn btn-xs btn-error" onClick={() => removeFromCart(idx)}>✕</button>
              </div>
              {/* Slider Tawar */}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs">Harga:</span>
                <input type="range" min="0" max={item.hpp_satuan * 2} step="100" className="range range-primary range-xs flex-1" value={item.harga_satuan_jual} onChange={(e) => updatePrice(idx, parseFloat(e.target.value))} />
                <span className="text-sm font-bold">Rp{item.harga_satuan_jual}</span>
              </div>
              {isRugi && <p className="text-red-600 font-bold text-sm animate-pulse">⚠️ HATI-HATI! HARGA DI BAWAH MODAL!</p>}
            </div>
          );
        })}
      </div>

      {/* ZONA 3: Pembayaran (Sticky) */}
      <div className="border-t-2 pt-2 bg-white sticky bottom-0">
        <div className="flex justify-between text-2xl font-bold">
          <span>TOTAL:</span>
          <span className="text-green-700">Rp {total.toLocaleString()}</span>
        </div>
        <div className="flex gap-2 mt-2">
          <input type="number" placeholder="Uang Bayar" className="input input-bordered flex-1 text-xl" value={uangBayar} onChange={(e) => hitungKembalian(parseFloat(e.target.value) || 0)} />
          <span className="text-xl font-bold text-blue-600">Kembali: Rp {kembalian.toLocaleString()}</span>
        </div>
        <button className="btn btn-success w-full mt-2 text-white text-xl" onClick={handleBayar} disabled={cart.length === 0 || uangBayar < total}>
          💰 BAYAR
        </button>
      </div>
    </div>
  );
}

// ========== MAIN APP (ROUTING SEDERHANA) ==========
function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));

  const path = window.location.pathname;

  if (!token) {
    return <Login setToken={setToken} setUser={setUser} />;
  }

  if (path === '/transaksi') {
    return <Transaksi />;
  }

  return <Dashboard user={user} setToken={setToken} setUser={setUser} />;
}

export default App;