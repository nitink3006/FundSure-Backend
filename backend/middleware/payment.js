
/**
 * Fake payment middleware for development
 * This simulates payment processing without requiring the Stripe library
 */

/**
 * Process payment (fake implementation)
 * @param {Object} paymentData - Payment data with campaignId and amount
 * @returns {Object} Payment result
 */
const processPayment = async (paymentData) => {
  try {
    // Generate a fake payment ID
    const paymentId = 'pay_fake_' + Math.random().toString(36).substring(2, 15);
    
    return {
      success: true,
      paymentId,
      message: 'Payment processed successfully',
    };
  } catch (error) {
    console.error('Payment processing error:', error.message);
    return {
      success: false,
      message: error.message,
    };
  }
};

/**
 * Create a payment intent for client-side payment processing
 * @param {Number} amount - Amount in cents
 * @param {Object} metadata - Additional metadata for the payment
 * @returns {Object} Payment intent result
 */
const createPaymentIntent = async (amount, metadata = {}) => {
  try {
    // Generate a fake client secret
    const clientSecret = 'fake_secret_' + Math.random().toString(36).substring(2, 15);
    
    console.log(`Creating fake payment intent for $${amount/100} with metadata:`, metadata);
    
    return {
      success: true,
      clientSecret,
    };
  } catch (error) {
    console.error('Error creating payment intent:', error.message);
    return {
      success: false,
      message: error.message,
    };
  }
};

module.exports = {
  processPayment,
  createPaymentIntent,
};
