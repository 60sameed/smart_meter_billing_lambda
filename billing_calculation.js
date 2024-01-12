'use strict'

import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry';
import { DynamoDBClient} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const docClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({
        retryStrategy: new ConfiguredRetryStrategy(
            3,
            (attempt) => attempt * 1000
        )
    })
);
const SMART_METER_DATA_TABLE = "SmartMeterData";

function clean (obj) {
    //removing undefined & null properties
    return Object.entries(obj).reduce((accum, [key, value]) => ((value === null || value === undefined)? accum: (accum[key]=value, accum)), {});
}
async function queryRecords (TableName, ProjectionExpression, KeyConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues, ScanIndexForward, ExclusiveStartKey, Limit) {
    const params = clean({TableName, ProjectionExpression, KeyConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues, ScanIndexForward, ExclusiveStartKey, Limit});
    const command = new QueryCommand(params);
    return await docClient.send(command);
}


export async function calculateAggregateCost (meterId, startTime, endTime) {
    let cost = 0;
    async function calculateCostPaginated (TableName, ProjectionExpression, KeyConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues, ScanIndexForward, ExclusiveStartKey, Limit) {
        const result = await queryRecords(TableName, ProjectionExpression, KeyConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues, ScanIndexForward, ExclusiveStartKey, Limit);
        cost = result?.Items.map(i => i?.cost || 0).reduce((accum, c) => accum + c, cost);
        if (result.LastEvaluatedKey) {
            return await calculateCostPaginated(TableName, ProjectionExpression, KeyConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues, ScanIndexForward, result.LastEvaluatedKey, Limit);
        }
        return cost;
    };
    return await calculateCostPaginated(SMART_METER_DATA_TABLE,
        "cost",
        "meterId = :m AND #t BETWEEN :s AND :e",
        {"#t": "timestamp"},
        {":m": meterId, ":s": startTime, ":e": endTime},
        false,
        null
    );
}

async function startProcess () {
    //please input your params here: startTime & endTime should be in format "YYYY-MM-DDTHH:mm:ss"
    const cost = await calculateAggregateCost(1234567, "2023-10-10T10:00:00", "2023-10-12T16:00:00");
    console.log(`Total cost for the given time period is £${cost}`);
};

// startProcess();
