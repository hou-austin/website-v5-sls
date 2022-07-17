import { APIGatewayEvent } from "aws-lambda";

const sharp = require('sharp');
const AWS = require('aws-sdk');

const s3 = new AWS.S3();

const supportedWidths = new Set([1920, 1280, 1200, 1024, 768, 720, 640, 560, 480, 320, 240]);

exports.handler = async (event: APIGatewayEvent) => {
  console.log('request: ' + JSON.stringify(event, undefined, 2));
  if (event.headers['user-agent'] !== 'Amazon CloudFront') {
    console.log('Not from cloudfront!');
    return {
      statusCode: 403,
      body: 'Forbidden'
    };
  }

  const {image, width} = event.pathParameters;

  // Redirect to default supported width when requested with is not supported
  if (!supportedWidths.has(parseInt(width))) {
    return {
      statusCode: 403,
      body: `Not authorized, invalid width, given: ${width}`
    }
  }

  const file = await s3.getObject({
    Bucket: process.env.PRIVATE_BUCKET_NAME,
    Key: image
  }).promise();

  console.log('Fetched image');

  const {data, info} = await sharp(file.Body).resize({width: parseInt(width)}).toBuffer({resolveWithObject: true});

  console.log('Resized image');

  await s3.putObject({
    Bucket: process.env.CDN_BUCKET_NAME,
    Key: `image/${width}/${image}`,
    Body: data,
    ContentType: 'image/' + info.format,
    Metadata: {
      original_key: image
    }
  }).promise();

  console.log('Uploaded image');

  return {
    statusCode: 200,
    body: Buffer.from(data).toString('base64'),
    isBase64Encoded: true,
    headers: {
      'Content-Type': 'image/' + info.format,
    }
  }
}