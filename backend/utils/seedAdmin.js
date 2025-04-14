
const User = require('../models/User');

const seedAdminUser = async () => {
  try {
    // Check if admin already exists
    const adminExists = await User.findOne({ email: 'admin@example.com' });
    
    if (!adminExists) {
      console.log('Creating admin user...');
      await User.create({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'admin123',
        role: 'admin'
      });
      console.log('Admin user created successfully');
    } else {
      console.log('Admin user already exists');
    }

    // Check if regular user exists
    const regularUserExists = await User.findOne({ email: 'user@example.com' });
    
    if (!regularUserExists) {
      console.log('Creating regular user...');
      await User.create({
        name: 'Regular User',
        email: 'user@example.com',
        password: 'user123',
        role: 'user'
      });
      console.log('Regular user created successfully');
    } else {
      console.log('Regular user already exists');
    }
  } catch (error) {
    console.error('Error creating seed users:', error.message);
  }
};

module.exports = seedAdminUser;
