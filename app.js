const express = require('express');
const cors = require('cors');
const path = require('path');
const GoMerchant = require('./GoMerchant');

const app = express();
const sdk = new GoMerchant();

app.set('json spaces', 2);
// Mengizinkan panggilan lintas domain (mis. dari website toko yang beda
// domain/hosting) ke endpoint /api/qris/status. Kalau mau dibatasi hanya
// ke domain toko tertentu, ganti origin: true dengan origin: 'https://domain-toko-kamu.com'.
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs'); 
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
    res.render('index')
});

app.post('/auth/otp', async (req, res) => {
    try {
        const data = await sdk.requestOtp(req.body.phone);
        res.json({ success: true, data, phone: req.body.phone });
    } catch (e) {
        res.status(400).json({ success: false, error: e.response?.data || e.message });
    }
});

app.post('/auth/verify', async (req, res) => {
    try {
        const data = await sdk.verifyOtp(req.body.otp, req.body.otp_token);
        res.json({ success: true, data });
    } catch (e) {
        res.status(400).json({ success: false, error: e.response?.data || e.message });
    }
});


app.post('/auth/refresh/token', async (req, res) => {
    try {
        const refreshToken = req.body.refresh_token;
        if (!refreshToken) {
            return res.status(400).json({ success: false, error: 'refresh_token wajib diisi' });
        }

        const data = await sdk.refreshToken(refreshToken);
        res.json({ success: true, data });
    } catch (e) {
        res.status(401).json({ success: false, error: e.response?.data || e.message });
    }
});

app.post('/api/validate', async (req, res) => {
    try {
        const data = await sdk.getMe(req.body.token);
        res.json({ success: true, user: data.user, access_token: req.body.token });
    } catch (e) {
        res.status(401).json({ success: false, error: e.response?.data || e.message });
    }
});

app.get('/api/qris/create', async (req, res) => {
    try {
        const { amount, static_qr } = req.query;
        
        if (!amount || !static_qr) {
            return res.status(400).json({ 
                success: false, 
                error: 'Parameter amount dan static_qr wajib diisi' 
            });
        }

        const data = await sdk.createDynamicQRIS(amount, static_qr);
        
        const qrBuffer = Buffer.isBuffer(data.qr_buffer) 
            ? data.qr_buffer 
            : Buffer.from(data.qr_buffer.data); 

        const timestamp = Date.now();
        const filename = `QRIS-${timestamp}.png`;

        res.set({
            'Content-Type': 'image/png',
            'Content-Disposition': `inline; filename="${filename}"`,
            'Cache-Control': 'no-cache'
        });
        
        res.send(qrBuffer);
        
    } catch (e) {
        res.status(400).json({ 
            success: false, 
            error: e.response?.data || e.message 
        });
    }
});

app.post('/api/qris/status', async (req, res) => {
    try {
        const user = await sdk.getMe(req.body.token);
        const logs = await sdk.getJournals(req.body.token, user.user.merchant_id, req.body.created_at);
        const amountSearch = parseInt(req.body.amount) * 100;
        const found = logs.hits.find(h => {
            const txTime = new Date(h.time).getTime();
            const qrisTime = new Date(req.body.created_at).getTime();
            return h.amount === amountSearch && txTime >= qrisTime;
        });
        res.json({ success: true, status: found ? 'PAID' : 'PENDING', data: found || null });
    } catch (e) {
        res.status(400).json({ success: false, error: e.response?.data || e.message });
    }
});

app.post('/api/payouts', async (req, res) => {
    try {
        const data = await sdk.getPayouts(req.body.token);
        res.json({ success: true, data });
    } catch (e) {
        res.status(400).json({ success: false, error: e.response?.data || e.message });
    }
});

app.post('/api/history', async (req, res) => {
    try {
        const user = await sdk.getMe(req.body.token);
        const defaultStartTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const startTime = req.body.startTime || defaultStartTime;
        const data = await sdk.getJournals(req.body.token, user.user.merchant_id, startTime);
        res.json({ success: true, data });
    } catch (e) {
        res.status(400).json({ success: false, error: e.response?.data || e.message });
    }
});

app.post('/api/me', async (req, res) => {
    try {
        const data = await sdk.getMe(req.body.token);
        res.json({ success: true, data });
    } catch (e) {
        res.status(400).json({ success: false, error: e.response?.data || e.message });
    }
});

const PORT = process.env.PORT || 3015;
app.listen(PORT, () => console.log(`GoMerch listening on port ${PORT}`));
