import { APIGatewayEvent } from "aws-lambda";

const sharp = require('sharp');
const AWS = require('aws-sdk');

const s3 = new AWS.S3();

const supportedWidths = new Set([1920, 1280, 1200, 1024, 768, 720, 640, 560, 480, 450, 320, 240, 0]);
const supportedFormats = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'source']);
const quality = 80;

type Props = APIGatewayEvent & {
  pathParameters: {
    width: string,
    format: string,
    image: string
  }
}

exports.handler = async (event: Props) => {
  console.log('request: ' + JSON.stringify(event, undefined, 2));
  if (event.headers['user-agent'] !== 'Amazon CloudFront') {
    console.log('Not from cloudfront!');
    return {
      statusCode: 403,
      body: 'Forbidden'
    };
  }

  const {width, format, image} = event.pathParameters;

  // Redirect to default supported width when requested with is not supported
  if (!supportedWidths.has(parseInt(width))) {
    return {
      statusCode: 403,
      body: `Not authorized, invalid width, given: ${width}`
    }
  }
  const isWidthZero = parseInt(width) === 0;

  console.log(`Resizing ${image} to ${isWidthZero ? 'source width' : `${width}px`}, with format ${format}`);

  const imageUrlComponents = image.split('.');
  let targetFormat = imageUrlComponents.pop();
  const fileName = imageUrlComponents.join('.');
  const originalImageUrl = `${fileName}.${format === 'source' ? targetFormat : format}`;

  if (!targetFormat || !supportedFormats.has(targetFormat)) {
    return {
      statusCode: 403,
      body: `Not authorized, invalid format, given: ${format}`
    }
  }

  const file = await s3.getObject({
    Bucket: process.env.PRIVATE_BUCKET_NAME,
    Key: originalImageUrl
  }).promise();
  console.log('Fetched image');

  let transformedImage = await (isWidthZero ? sharp(file.Body) : sharp(file.Body).resize({width: parseInt(width)}).rotate());
  console.log('Resized image');

  if (format !== 'source') {
    switch (targetFormat) {
      case 'jpg': {
        transformedImage = transformedImage.jpeg({quality});
        break;
      }
      case 'jpeg': {
        transformedImage = transformedImage.jpeg({quality});
        break;
      }
      case 'png': {
        transformedImage = transformedImage.png({quality});
        break;
      }
      case 'gif': {
        transformedImage = transformedImage.gif({quality});
        break;
      }
      case 'webp': {
        transformedImage = transformedImage.webp({quality});
        break;
      }
      case 'avif': {
        transformedImage = transformedImage.avif({quality: Math.floor(quality * 0.7)}).rotate();
        break;
      }
      default: break;
    }
  } else {
    targetFormat = 'source';
  }

  const { data, info } =  await transformedImage.toBuffer({resolveWithObject: true})

  await s3.putObject({
    Bucket: process.env.CDN_BUCKET_NAME,
    Key: `image/${width}/${targetFormat}/${image}`,
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
      'Cache-Control': 'public, max-age=31536000',
    }
  }
}