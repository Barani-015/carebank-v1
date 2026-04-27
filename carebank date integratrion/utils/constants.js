module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/carebank',
  PORT: process.env.PORT || 3000
};