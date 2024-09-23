const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  constituency: String,
  status: { type: String, enum: ['pending', 'accepted', 'refused'], default: 'pending' }
});

module.exports = mongoose.model('User', userSchema);
