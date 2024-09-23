const mongoose = require('mongoose');

const voterSchema = new mongoose.Schema({
  Name: String,
  Constituency: String,
  Ward_No: Number,
  Votting_Boothe_Name: String,
  Epic_No: String,
  Middle_Name: String,
  Gender: String,
  age: Number,
  English_Name: String,
  Marathi_Name: String,
});

module.exports = mongoose.model('Voter', voterSchema);
