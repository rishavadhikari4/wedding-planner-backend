const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
                    name: 
                    { type: String, 
                        required: true },
                    image: 
                    { type: String, 
                        required: true },
                    quantity: { 
                        type: Number, 
                        required: true }
});

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [orderItemSchema], // Array of order items
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
