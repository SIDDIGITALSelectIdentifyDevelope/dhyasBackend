const mongoose = require('mongoose');

const voteStatusSchema = new mongoose.Schema({
  name: String,
  status: String // e.g., 'Voted' or 'Not Voted'
});

module.exports = mongoose.model('VoteStatus', voteStatusSchema);
