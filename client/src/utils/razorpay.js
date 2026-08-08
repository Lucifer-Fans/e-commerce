const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loaderPromise = null;

/**
 * Loads the Razorpay checkout script once, on demand. Keeping it out of index.html
 * means visitors who never reach checkout don't pay for it.
 */
export function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(true);
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      loaderPromise = null; // allow a retry on the next attempt
      resolve(false);
    };
    document.body.appendChild(script);
  });

  return loaderPromise;
}

/**
 * Opens the hosted checkout.
 * @returns {Promise<{status:'success'|'dismissed'|'failed', payload?:object, error?:object}>}
 */
export function openRazorpayCheckout({ keyId, order, prefill, name, description, onDismiss }) {
  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.razorpayOrderId,
      name,
      description,
      prefill,
      theme: { color: '#2563eb' },
      handler: (response) =>
        resolve({
          status: 'success',
          payload: {
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          },
        }),
      modal: {
        ondismiss: () => {
          onDismiss?.();
          resolve({ status: 'dismissed' });
        },
      },
    });

    rzp.on('payment.failed', (response) => resolve({ status: 'failed', error: response.error }));
    rzp.open();
  });
}
