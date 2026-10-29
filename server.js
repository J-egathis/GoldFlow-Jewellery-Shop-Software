const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { sequelize } = require('./backend/models');
const { initializeDefaultData } = require('./backend/utils/initDefaults');
const morgan = require('morgan');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const multer = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/\s+/g, '_'))
  }
})
const upload = multer({ storage: storage })

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  const fileUrl = '/uploads/' + req.file.filename;
  res.json({ url: fileUrl });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('dev'));

// Make io accessible to all routers
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
const authRoutes = require('./backend/routes/auth');
const jewelleryRoutes = require('./backend/routes/jewellery');
const salesRoutes = require('./backend/routes/sales');
const dashboardRoutes = require('./backend/routes/dashboard');
const usersRoutes = require('./backend/routes/users');
const customersRoutes = require('./backend/routes/customers');
const reportsRoutes = require('./backend/routes/reports');
const auditRoutes = require('./backend/routes/audit');
const notifRoutes = require('./backend/routes/notifications');
const goldRatesRoutes = require('./backend/routes/goldRates');
const purchasesRoutes = require('./backend/routes/purchases');
const suppliersRoutes = require('./backend/routes/suppliers');
const returnsRoutes = require('./backend/routes/returns');
const exchangesRoutes = require('./backend/routes/exchanges');
const advancePaymentsRoutes = require('./backend/routes/advancePayments');
const duesRoutes = require('./backend/routes/dues');
const expensesRoutes = require('./backend/routes/expenses');
const settingsRoutes = require('./backend/routes/settings');

app.use('/api/auth', authRoutes);
app.use('/api/jewellery', jewelleryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/notifications', notifRoutes);
app.use('/api/gold-rates', goldRatesRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/exchanges', exchangesRoutes);
app.use('/api/advances', advancePaymentsRoutes);
app.use('/api/dues', duesRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/settings', settingsRoutes);

io.on('connection', (socket) => {
  socket.on('join', (userId) => {
    socket.join(userId.toString());
  });

  socket.on('join_role', (role) => {
    socket.join(role);
  });

  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3000;

sequelize.sync().then(async () => {
  await initializeDefaultData();

  // Initialize Live Market Gold Rate Auto-Sync Scheduler
  const { initAutoSyncScheduler } = require('./backend/services/goldRateService');
  initAutoSyncScheduler(io, 15);

  // No host argument => Node listens dual-stack ("::"), accepting both IPv6 (::1 / localhost)
  // and IPv4 (127.0.0.1 / LAN phones). Binding only '0.0.0.0' caused a ~200ms+ IPv6 fallback
  // delay on every new browser connection to http://localhost on Windows.
  server.listen(PORT, () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let localIp = 'localhost';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          localIp = net.address;
        }
      }
    }
    console.log('\n=========================================');
    console.log('🌟 GoldFlow Server is Running! 🌟');
    console.log('=========================================');
    console.log('💻 Access on this PC : http://localhost:' + PORT);
    console.log('📱 Access on Phones  : http://' + localIp + ':' + PORT);
    console.log('=========================================\n');
  });
}).catch(err => {
  console.error('Unable to connect to the database:', err);
});
