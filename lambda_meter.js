'use strict'

// Please refer to assumptions in README.md
import {configDotenv} from "dotenv";
configDotenv()
import moment from 'moment-timezone';
import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const docClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({
        retryStrategy: new ConfiguredRetryStrategy(
            3,
            (attempt) => attempt * 1000
        )
    })
);
const PEAK_HOUR_START = parseInt(process.env.PEAK_HOUR_START);
const PEAK_HOUR_END = parseInt(process.env.PEAK_HOUR_END);
const PEAK_HOUR_RATE = parseFloat(process.env.PEAK_HOUR_RATE);
const OFF_PEAK_HOUR_RATE = parseFloat(process.env.OFF_PEAK_HOUR_RATE);
const SMART_METER_DATA_TABLE = "SmartMeterData";
const DATE_FORMAT = "YYYY-MM-DDTHH:mm:ss";


function isPeakHour (hour) {
    return hour >= PEAK_HOUR_START && hour < PEAK_HOUR_END;
}

function calculateCost (currentReading, lastReading, hour) {
    return (currentReading - lastReading) * (isPeakHour(hour)? PEAK_HOUR_RATE: OFF_PEAK_HOUR_RATE);
}

function clean (obj) {
    return Object.entries(obj).reduce((accum, [key, value]) => ((value === null || value === undefined)? accum: (accum[key]=value, accum)), {})
}


async function queryRecords (TableName, ProjectionExpression, KeyConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues, ScanIndexForward, ExclusiveStartKey, Limit) {
    const input = clean({TableName, ProjectionExpression, KeyConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues, ScanIndexForward, ExclusiveStartKey, Limit});
    const command = new QueryCommand(input);
    return await docClient.send(command);
}

async function putRecord (TableName, Item, ReturnValues) {
    const input = clean({TableName, Item, ReturnValues});
    const command = new PutCommand(input);
    return await docClient.send(command);
}

async function processEvent (event) {
    const [meterId, timestamp, meterReading] = event;

    try {
        /* Point 8 in assumptions:
           Ideally lastRecord timestamp should be one hour earlier. We are only doing 3 retries on database query failure after that we don't have any mechanism.
           Possible solutions might be maintaining records of unprocessed data or resending the record to lambda on failure response. For now, I'll charge the missing
           hours according to the running hour rate and if the initial data gets missed for a meter it's counted as single hour meter reading.
        */
        const {Items} = await queryRecords(SMART_METER_DATA_TABLE, "#t, meterReading", "meterId = :m", {"#t": "timestamp"}, { ":m": meterId }, false, null,1);
        const [lastRecord] = Items;
        const momentTimestamp = moment(timestamp, DATE_FORMAT);
        const cost = calculateCost(meterReading, lastRecord?.meterReading || 0, momentTimestamp.subtract(1, "hour").get("hours"));

        //putting billing record in db
        const record = {meterId, timestamp, meterReading, cost};
        await putRecord(SMART_METER_DATA_TABLE, record);
        console.log(`Record Inserted: ${JSON.stringify(record)}`);
        return record;

    } catch(ex) {
        console.error(`Failed to process the given meter record ${JSON.stringify(event)}. Details: `, ex);
        throw new Error("Failed to process the event payload. Please try again.");
    }
}


export async function handler (event, context, callback) {
    try {
        await processEvent(event);
        return callback(null, "Smart meter data ingested successfully.");

    } catch (ex) {
        return callback(ex, null);
    }
};

export const unitsTestsExport = {
    DATE_FORMAT,
    processEvent,
    calculateCost
};

// handler([1234567, "2023-10-12T09:00:00", 555.2], null, (err, msg) => { console.log(msg||err); });
