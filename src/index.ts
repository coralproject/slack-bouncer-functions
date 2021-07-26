import { PubSub } from "@google-cloud/pubsub";
import jwt, { JwtPayload } from "jsonwebtoken";
import Joi from "joi";
import convict from "convict";
import type { Request, Response } from "express";

// Parse the configuration.
const config = convict({
  token_secret: {
    format: String,
    default: "",
    env: "TOKEN_SECRET",
  },
  pubsub_topic: {
    format: String,
    default: "",
    env: "PUBSUB_TOPIC",
  },
});

// Perform validation on the config.
config.validate({ allowed: "strict" });

// Build up the comment schema.
const DataSchema = Joi.object().keys({
  id: Joi.string().required(),
  source: Joi.string().optional().default("comment"),
});

// Extract the signing secret now.
const secret = config.get("token_secret");
if (!secret) {
  throw new Error("TOKEN_SECRET is missing");
}

const topicName = config.get("pubsub_topic");
if (!topicName) {
  throw new Error("PUBSUB_TOPIC is missing");
}

// Setup the pubsub publisher.
const pubsub = new PubSub();
const topic = pubsub.topic(topicName);

// Create the cloud functions endpoint.
export async function slackTalkInjestComment(req: Request, res: Response) {
  // Validate the comment input.
  const { value: data, error: err } = DataSchema.validate(req.body, {
    stripUnknown: true,
    convert: false,
  });
  if (err) {
    console.error(err);
    return res.status(400).end();
  }

  // Get the authorization token.
  const token = req.get("authorization");
  if (!token || token.length === 0) {
    console.error(new Error("no authorization token"));
    return res.status(401).end();
  }

  // Get the handshake token.
  const handshakeToken = req.get("x-handshake-token");
  if (!handshakeToken || handshakeToken.length === 0) {
    console.error(new Error("no handshake token"));
    return res.status(400).end();
  }

  // Decode the token.
  let decoded: string | JwtPayload;
  try {
    // Verify that the token is valid.
    decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch (err) {
    console.error(err);
    return res.status(401).end();
  }

  if (typeof decoded === "string") {
    return res.status(400).end();
  }

  // Extract the installation id from the decoded token.
  const installID = decoded.jti;

  // TODO: check if the installID has been blacklisted.

  // Construct the payload to publish to pubsub.
  const payload = {
    install_id: installID,
    handshake_token: handshakeToken,
    data,
  };

  try {
    // Publish the payload to pubsub.
    await topic.publishMessage({ json: payload });

    // Respond that we handled the payload successfully.
    return res.status(204).end();
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
}
