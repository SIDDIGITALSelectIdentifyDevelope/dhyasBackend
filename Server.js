const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const User = require('./models/User'); // Ensure you have User model
const Voter = require('./models/Voter'); // Ensure you have Voter model

const app = express();
const port = 5000;

// Middleware
app.use(bodyParser.json());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'], // Allow both origins
  credentials: true,
}));
app.use(session({
  secret: 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }, // Set to true if using HTTPS
}));

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/dhyas', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected at mongodb://localhost:27017/dhyas'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware for authentication
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  return res.status(401).json({ message: 'Not authenticated' });
};

// Middleware for admin role
const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: 'Admin access required' });
};

// Middleware for authenticated users with authority role
const isAuthority = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'authority') {
    return next();
  }
  return res.status(403).json({ message: 'Authority access required' });
};

// Signup Route
app.post('/api/signup', async (req, res) => {
  const { username, password, role, constituency } = req.body;

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const status = (role === 'admin') ? 'accepted' : 'pending';
    const user = new User({ username, password, role, constituency, status });
    await user.save();

    if (role === 'admin') {
      const userCollectionName = `user_${username}_collection`;
      await mongoose.connection.db.createCollection(userCollectionName);
      req.session.user = user;
      return res.status(201).json({ message: 'Admin signup and login successful', user });
    }

    res.status(201).json({ message: 'Signup request submitted. Awaiting admin approval.' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Failed to signup user', error: error.message });
  }
});

// Admin Accept User Route
app.post('/api/admin/accept', isAdmin, async (req, res) => {
  const { username } = req.body;

  try {
    const user = await User.findOneAndUpdate(
      { username, role: { $ne: 'admin' } },
      { status: 'accepted' },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found or cannot accept admin users' });
    }

    const userCollectionName = `user_${username}_collection`;
    await mongoose.connection.db.createCollection(userCollectionName);

    res.json({ message: 'User accepted successfully', user });
  } catch (error) {
    console.error('Error accepting user:', error);
    res.status(500).json({ message: 'Failed to accept user', error: error.message });
  }
});

// Admin Refuse User Route
app.post('/api/admin/refuse', isAdmin, async (req, res) => {
  const { username } = req.body;

  try {
    const user = await User.findOneAndUpdate(
      { username, role: { $ne: 'admin' } },
      { status: 'refused' },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found or cannot refuse admin users' });
    }

    res.json({ message: 'User refused successfully', user });
  } catch (error) {
    console.error('Error refusing user:', error);
    res.status(500).json({ message: 'Failed to refuse user', error: error.message });
  }
});

// Login Route
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user || user.password !== password) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.status !== 'accepted') {
      return res.status(403).json({ message: 'Your signup request is not yet accepted' });
    }

    req.session.user = user;
    res.json({ message: 'Login successful', user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

// User Info Route
app.get('/api/user', isAuthenticated, (req, res) => {
  res.json({ user: req.session.user });
});

// Admin Dashboard Route
app.get('/api/admin/dashboard', isAdmin, async (req, res) => {
  try {
    const { constituency } = req.session.user;
    const pendingUsers = await User.find({ constituency, status: 'pending', role: { $ne: 'admin' } });
    const acceptedUsers = await User.find({ constituency, status: 'accepted', role: { $ne: 'admin' } });

    res.json({ pendingUsers, acceptedUsers });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard data', error: error.message });
  }
});

// Fetch User Data Route
app.get('/api/user/data', isAuthenticated, async (req, res) => {
  try {
    const userCollectionName = `user_${req.session.user.username}_collection`;
    const userCollection = mongoose.connection.db.collection(userCollectionName);
    const userData = await userCollection.find().toArray();

    res.json({ userData });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ message: 'Failed to fetch user data', error: error.message });
  }
});

// Voter List Routes
// Create a new voter (Admin only)
app.post('/api/voters', isAdmin, async (req, res) => {
  try {
    const { username } = req.session.user;
    const userCollectionName = `user_${username}_collection`;
    const voter = new Voter(req.body);
    await mongoose.connection.db.collection(userCollectionName).insertOne(voter);
    res.status(201).json({ message: 'Voter added successfully', voter });
  } catch (error) {
    console.error('Error adding voter:', error);
    res.status(500).json({ message: 'Failed to add voter', error: error.message });
  }
});

// Get all voters (Authenticated users)
app.get('/api/voters', isAuthenticated, async (req, res) => {
  try {
    const { username } = req.session.user;
    const userCollectionName = `user_${username}_collection`;
    const voters = await mongoose.connection.db.collection(userCollectionName).find().toArray();
    res.json(voters);
  } catch (error) {
    console.error('Error fetching voters:', error);
    res.status(500).json({ message: 'Failed to fetch voters', error: error.message });
  }
});

// Fetch a single voter by ID (Authenticated users)
app.get('/api/voters/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid voter ID format' });
  }

  const { username } = req.session.user;
  const userCollectionName = `user_${username}_collection`;

  try {
    const voter = await mongoose.connection.db.collection(userCollectionName).findOne({ _id: new mongoose.Types.ObjectId(id) });
    if (!voter) return res.status(404).json({ message: 'Voter not found' });

    res.json(voter);
  } catch (error) {
    console.error('Error fetching voter:', error);
    res.status(500).json({ message: 'Failed to fetch voter', error: error.message });
  }
});

// Update a voter by ID (Admin and Authority only)
app.put('/api/voters/:id', (req, res, next) => {
  if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'authority')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, async (req, res) => {
  const voterId = req.params.id;
  const updatedVoterData = req.body;

  try {
    if (!mongoose.Types.ObjectId.isValid(voterId)) {
      return res.status(400).json({ message: 'Invalid voter ID format' });
    }

    const { username } = req.session.user;
    const userCollectionName = `user_${username}_collection`;

    const updatedVoter = await mongoose.connection.db.collection(userCollectionName).findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(voterId) },
      { $set: updatedVoterData },
      { returnOriginal: false }
    );

    if (!updatedVoter.value) {
      return res.status(404).json({ message: 'Voter not found' });
    }

    res.status(200).json({ voter: updatedVoter.value });
  } catch (error) {
    console.error('Error updating voter:', error);
    res.status(500).json({ message: 'Error updating voter', error: error.message });
  }
});

// Delete a voter by ID (Admin only)
app.delete('/api/voters/:id', isAdmin, async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid voter ID format' });
  }

  try {
    const { username } = req.session.user;
    const userCollectionName = `user_${username}_collection`;

    const deletedVoter = await mongoose.connection.db.collection(userCollectionName).findOneAndDelete({ _id: new mongoose.Types.ObjectId(id) });

    if (!deletedVoter.value) {
      return res.status(404).json({ message: 'Voter not found' });
    }

    res.json({ message: 'Voter deleted successfully' });
  } catch (error) {
    console.error('Error deleting voter:', error);
    res.status(500).json({ message: 'Failed to delete voter', error: error.message });
  }
});
// Get all voters with pagination (Authenticated users)
app.get('/api/voters', isAuthenticated, async (req, res) => {
  try {
    const { username } = req.session.user;
    const userCollectionName = `user_${username}_collection`;

    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalVoters = await mongoose.connection.db.collection(userCollectionName).countDocuments();
    const voters = await mongoose.connection.db.collection(userCollectionName)
      .find()
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({ voters, totalPages: Math.ceil(totalVoters / limit) });
  } catch (error) {
    console.error('Error fetching voters:', error);
    res.status(500).json({ message: 'Failed to fetch voters', error: error.message });
  }
});

// Logout Route
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ message: 'Failed to logout' });
    }
    res.clearCookie('connect.sid'); // Clear the session cookie
    res.json({ message: 'Logout successful' });
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
