# Smart Meter Billing Lambda function (Node.js)

## Quick Guide

###  Environment details
The code was deployed and tested on Lambda running Node.js 20.x

### Pre-reqs For Lambda Deployment
1. Create lambda function with name: "smart_meter_billing_lambda", handler: "lambda_meter.handler" and node.js: "20.x"
2. Provide DynamoDB access to the lambda function by attaching "AmazonDynamoDBFullAccess" policy to the lambda function role. 
3. Create Table in DynamoDB named "SmartMeterData" with Partition Key: meterId(Number) & Sort Key: timestamp(String)

### Deployment of Lambda Function 
For manual lambda deployment follow the below steps on your local.
1. Run `npm i` to install dependencies.
2. Run `npm test` to run the test cases.
3. Create .zip file of all the files under ./smart_meter_billing_lambda including "node_modules" dir.
4. Upload the zip the file on AWS Lambda function.

### Running Lambda locally
Make sure you have the AWS config & credentials file under ~/.aws directory on your local.
1. Open `lambda_meter.js` and uncomment line 9. 
2. Run `npm start` to execute the lambda.

### Billing calculation for any interval for a single meter
There is an additional file named "billing_calculation.js" which is not part of lambda but can be used to calculate cost between two timestamps. 
You can input the params on line 49, uncomment line 53 and run `node billing_calculation.js`.

### Assumptions
The lambda function code was written with the following assumptions:
1. Incoming smart meter data will not be delayed, corrupted or missed. It will be sent sequentially in hourly intervals.
2. Tariffs/Hourly rates are constant values so we can have those input from the environment variable "HOURLY_RATE". Not making it complex by moving it to DB or a cache as it is fetched frequently.
3. If tariffs are not input through environment variable "HOURLY_RATE" default offpeak hour rate of 0.5£/kWh between (12am-7am) and peak hour rate of 1£/kWh between (7am-12am) will be charged.
4. All timestamps will come in GMT timezone with format i.e. "YYYY-MM-DDTHH:mm:ss"
5. For a given meter, all timestamps will come at the fixed number of minutes and seconds e.g.
   For meter A, if the very first timestamp is at 00 hour 05 minutes and 20 seconds (2024-01-01T00:05:20)
   then all the successive timestamps for meter A will be coming with the same minutes & seconds (2024-01-01T01:05:20, 2024-01-01T02:05:20)
6. The peak hours are in continuity if there are multiple sequences of peak hours per day it will be handled in isPeakHour() function and we might have
   just one environment variable in that case PEAK_HOURS="7-12,16-22"
7. Within lambda because of some exception (database connection) we may loss the record even after retries. In that case I'll be costing that missed hours reading with the current hour charging (peak hour/off peak hour)
