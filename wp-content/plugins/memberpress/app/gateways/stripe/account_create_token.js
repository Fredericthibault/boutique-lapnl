(function ($) {
  $(document).ready(function() {
    //Trigger a click on stripe checkout automatically
    var done = false; //Prevent double submit (for some reason)
    if(!done) {
      $("button.stripe-button-el").trigger("click");
      done = true;
    }

    var stripe = Stripe(MeprStripeGateway.public_key);
    var elements = stripe.elements();
    var card = elements.create('card');
    card.mount('#card-element');
    card.addEventListener('change', function(event) {
      var displayError = document.getElementById('card-errors');
      if (event.error) {
        displayError.textContent = event.error.message;
      } else {
        displayError.textContent = '';
      }
    });

    var stripePaymentForm = $('#mepr-stripe-payment-form');
    stripePaymentForm.on('submit', function(e) {
      e.preventDefault();
      stripePaymentForm.find('.mepr-submit').disabled = true;
      stripePaymentForm.find('.mepr-loading-gif').show();

      var cardData = {
        billing_details: getBillingDetails()
      };

      stripe.createPaymentMethod('card', card, cardData).then(function(result) {
        if (result.error) {
          handlePaymentError(result.error.message);
        } else {
          confirmPayment({
            payment_method_id: result.paymentMethod.id
          });
        }
      });

      return false; // submit from callback
    });

    /**
     * Returns the form fields in a pretty key/value hash
     *
     * @param  {jQuery} form
     * @return {object}
     */
    function getFormData(form) {
      return form.serializeArray().reduce(function(obj, item) {
        obj[item.name] = item.value;
        return obj;
      }, {});
    }

    /**
     * Get the billing details object to pass to Stripe
     *
     * @return {object}
     */
    function getBillingDetails() {
      var formData = getFormData(stripePaymentForm);

      var details = {
        name: formData['card-name']
      };

      // Merges in the address fields if required for taxes
      if(formData['address_required'] == 1) {
        details.address = {
          line1: formData['card-address-1'],
          line2: formData['card-address-2'],
          city: formData['card-city'],
          state: formData['card-state'],
          postal_code: formData['card-zip']
        };

        // Stripe throws an error if country is empty
        if (typeof formData['card-country'] == 'string' && formData['card-country'].length) {
          details.address.country = formData['card-country'];
        }
      }

      return details;
    }

    /**
     * Handle an error with the payment
     *
     * @param {string} message The error message to display
     */
    function handlePaymentError(message) {
      console.log(message);
      // re-enable the submit button
      stripePaymentForm.find('.mepr-submit').prop('disabled', false);
      stripePaymentForm.find('.mepr-loading-gif').hide();
      stripePaymentForm.find('.mepr-form-has-errors').show();

      // Inform the user if there was an error
      var errorElement = document.getElementById('card-errors');
      errorElement.textContent = message;
    }

    /**
     * Handle the response from our Ajax endpoint after creating the SetupIntent
     *
     * @param {object} response
     */
    function handleServerResponse(response) {
      if (response === null || typeof response != 'object') {
        handlePaymentError(MeprStripeGateway.invalid_response_error)
      } else {
        if (response.error) {
          handlePaymentError(response.error);
        } else if (response.requires_action) {
          handleAction(response);
        } else if (!stripePaymentForm.hasClass('mepr-payment-submitted')) {
          stripePaymentForm.addClass('mepr-payment-submitted');
          stripePaymentForm[0].submit();
        }
      }
    }

    /**
     * Displays the card action dialog to the user
     *
     * @param {object} response
     */
    function handleAction(response) {
      var cardData = {
        payment_method_data: {
          billing_details: getBillingDetails()
        }
      };

      stripe.handleCardSetup(response.client_secret, card, cardData).then(function (result) {
        if (result.error) {
          handlePaymentError(result.error.message);
        } else {
          confirmPayment({
            setup_intent_id: result.setupIntent.id
          });
        }
      });
    }

    /**
     * Confirm the payment with our Ajax endpoint
     *
     * @param {object} extraData Additional data to send with the request
     */
    function confirmPayment(extraData) {
      var data = getFormData(stripePaymentForm);

      $.extend(data, extraData || {}, {
        action: 'mepr_stripe_update_payment_method',
        subscription_id: stripePaymentForm.data('sub-id'),
        gateway_id: stripePaymentForm.data('gateway-id')
      });

      $.ajax({
        type: 'POST',
        url: MeprStripeGateway.ajax_url,
        dataType: 'json',
        data: data
      })
      .done(handleServerResponse)
      .fail(function () {
        handlePaymentError(MeprStripeGateway.ajax_error);
      });
    }
  });
})(jQuery);
