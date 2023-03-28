'use strict';

const Raven = require('raven');
const sgMail = require('@sendgrid/mail');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const uid = require('uid2');
const config = require('../../config');
const { models } = require('../db/models');

sgMail.setApiKey(config.SECRETS.SENDGRID_API_KEY);
sgMail.setSubstitutionWrappers('{{', '}}');

const senderEmail = config.EMAIL_SENDER_ADDR;

/**
 * Setup sendinblue API
 * https://github.com/sendinblue/APIv3-nodejs-library
 */
const defaultClient = SibApiV3Sdk.ApiClient.instance;
// Configure API key authorization: api-key
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = config.SECRETS.SENDINBLUE_API_KEY;

const api = new SibApiV3Sdk.SMTPApi();

// You can use this to test connection
//
// var api = new SibApiV3Sdk.AccountApi()
// api.getAccount().then(function(data) {
//   console.log('API called successfully. Returned data: ' + data);
// }, function(error) {
//   console.error(error);
// });

// TODO: Fix this
const welcomeEmail = function (/* user */) {
	console.log('welcomeEmail template not created');

	// let msgTemplate = {}
	// msgTemplate.template_id = config.WELCOME_EMAIL
	// msgTemplate.from = senderEmail

	// msgTemplate.to = {
	//     name: user.firstname,
	//     email: user.email,
	// }

	// msgTemplate.substitutions = {
	//     "subject": "Welcome to Codingblocks",
	//     "username": user.username,
	// }

	// return sgMail.send(msgTemplate)
	//     .then(() => {
	//          console.log('mail sent');
	//     })
	//     .catch(error => {
	//         //  Raven.captureException(error);
	//         console.error(error.toString())

	//     })
};

/**
 * Fixed by Residit Team
 *
 * Send "verify email" email.
 *
 * @param {object} user
 * @param {string} key
 * @returns {object}
 * @todo Look into refactoring the method so that it doesn't use the "key"
         parameter
 */
const verifyEmail = async (user /* , key */) => {
	// TODO: Figure out why we aren't using an email address verification URL in
	//       a confirmation email.
	// const confirmURL = `${config.SERVER.URL  }/verify-email/key/${  key}`;

	const email = new SibApiV3Sdk.SendSmtpEmail();
	email.sender = new SibApiV3Sdk.SendSmtpEmailSender();
	email.sender.email = 'info@mailliberland.org';
	email.to = [{ name: user.username, email: user.email }];
	email.subject = 'Email confirmation';
	email.htmlContent =
		'<h1>Welcome to Liberland</h1>' +
		'<p>Thank you for your interest to become a citizen of Liberland. <br>' +
		`If you have any interest to speed up the process of establishing Liberland, please <a href="${config.FRONTEND_URL}/donate">donate to us</a> for administrative and diplomatic purposes.<br>` +
		'<p>Thank you.</p>';

	const result = await api.sendTransacEmail(email);

	return result;
};

/**
 * Fixed by Residit Team
 *
 * Send "verify email" email.
 *
 * @param {object} user
 * @param {string} key
 * @returns {object}
 */
const forgotPassEmail = async (user, key) => {
	const confirmURL = `${config.SERVER.URL}/forgot/password/new/${key}`;

	const email = new SibApiV3Sdk.SendSmtpEmail();
	email.sender = new SibApiV3Sdk.SendSmtpEmailSender();
	email.sender.email = 'info@mailliberland.org';
	email.to = [{ name: user.username, email: user.email }];
	email.subject = 'Password reset';
	email.htmlContent = `${
		'<h1>Password reset</h1>' +
		'<p>You recently requested to reset your password.</p>' +
		'<p><a href="'
	}${confirmURL}">RESET MY PASSWORD</a></p>`;

	const result = await api.sendTransacEmail(email);

	return result;
};

// Send a Single Email to Single or Multiple Recipients where they don't see each others email addresses

const verifyEmailPrivate = function (userEmails) {
	const msgTemplate = {};
	msgTemplate.template_id = config.VERIFY_EMAIL;
	msgTemplate.from = senderEmail;

	msgTemplate.to = userEmails;

	sgMail
		.sendMultiple(msgTemplate)
		.then(() => {
			//  console.log('mail sent');
		})
		.catch((error) => {
			Raven.captureException(error);
			console.error(error.toString());
		});
};

/**
 * Returns true if ok, false if error.
 */
const testEmail = async function () {
	/**
	 * https://github.com/sendinblue/APIv3-nodejs-library/blob/master/docs/SendSmtpEmail.md
	 */

	const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail(); // SendSmtpEmail | Values to send a transactional email
	sendSmtpEmail.sender = new SibApiV3Sdk.SendSmtpEmailSender();
	sendSmtpEmail.sender.email = 'info@mailliberland.org';
	sendSmtpEmail.to = [{ name: 'David', email: 'labcde@mailinator.com' }];

	const uniqueKey = uid(15);

	await models.Verifyemail.create({
		key: uniqueKey,
		userId: 42,
		include: [models.User],
	});
	// TODO: Figure out why the email doesn't use these parameters
	// const host = 'http://localhost:8040';
	// const urlEnd = `/verify-email/key/${  entry.key}`;

	sendSmtpEmail.htmlContent =
		'<h1>Welcome to Liberland</h1>' +
		'<p>Thank you for your interest to become a citizen of Liberland. <br>' +
		'If you have any interest to speed up the process of establishing Liberland, please <a href="liberland.org/donate">donate to us</a> for administrative and diplomatic purposes.<br>' +
		'Thank you.';
	sendSmtpEmail.subject = 'Email confirmation';

	return api.sendTransacEmail(sendSmtpEmail).then(
		(data) => {
			console.log('send OK', data);
			return 1;
		},
		(error) => {
			console.error('send error', error);
			return 0;
		}
	);
};

module.exports = {
	welcomeEmail,
	verifyEmail,
	forgotPasswordEmail: forgotPassEmail,
	verifyEmailPrivate,
	testEmail,
};
