const PubSub = require('@google-cloud/pubsub');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const convict = require('convict');

// Parse the configuration.
const config = convict({
  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV',
  },
  token_secret: {
    format: '*',
    default: null,
  },
  pubsub_topic: {
    format: '*',
    default: null,
  },
});

// Load environment dependent configuration.
const env = config.get('env');
config.loadFile('./config/' + env + '.json');

// Perform validation on the config.
config.validate({ allowed: 'strict' });

// Build up the comment schema.
const schema = Joi.object().keys({
  id: Joi.string().required(),
});

// Extract the signing secret now.
const secret = config.get('token_secret');

// Setup the pubsub publisher.
const pubsub = PubSub();
const topic = pubsub.topic(config.get('pubsub_topic'));
const publisher = topic.publisher();

// Create the cloud functions endpoint.
exports.slackTalkInjestComment = (req, res) => {
  // Validate the comment input.
  const { value: comment, error: err } = Joi.validate(req.body, schema, {
    stripUnknown: true,
    convert: false,
    presence: 'required',
  });
  if (err) {
    console.error(err);
    return res.status(400).end();
  }

  // Get the authorization token.
  const token = req.get('authorization');
  if (!token || token.length === 0) {
    console.error(new Error('no authorization token'));
    return res.status(401).end();
  }

  // Get the handshake token.
  const handshakeToken = req.get('x-handshake-token');
  if (!handshakeToken || handshakeToken.length === 0) {
    console.error(new Error('no handshake token'));
    return res.status(400).end();
  }

  // Decode the token.
  let decoded;
  try {
    // Verify that the token is valid.
    decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch (err) {
    console.error(err);
    return res.status(401).end();
  }

  // Extract the installation id from the decoded token.
  const installID = decoded.jti;

  // TODO: check if the installID has been blacklisted.

  // Construct the payload to publish to pubsub.
  const payload = {
    install_id: installID,
    handshake_token: handshakeToken,
    comment,
  };

  // Create a new buffer from the payload data.
  const buf = Buffer.from(JSON.stringify(payload));

  // Publish the payload to pubsub.
  publisher
    .publish(buf)
    .then(() => {
      // Respond that we handled the payload successfully.
      return res.status(204).end();
    })
    .catch(err => {
      console.error(err);
      return res.status(500).end();
    });
};
