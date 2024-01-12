'use strict'

import {configDotenv} from "dotenv";
configDotenv()
import moment from 'moment-timezone';
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { expect } from "chai";
import { calculateAggregateCost } from "./billing_calculation.js";
import { unitsTestsExport } from "./lambda_meter.js";

const { DATE_FORMAT, calculateCost, processEvent } = unitsTestsExport;
const ddbMock = mockClient(DynamoDBDocumentClient);

describe("Lambda function unit tests.", function () {
    beforeEach(function () {
        ddbMock.reset();
    });

    it("Cost of a meter for the first time.", async function () {
        ddbMock.on(QueryCommand).resolves({Items: []});

        const incomingRecord = [1234567, "2023-10-12T10:00:00", 655.2];
        const [meterId, timestamp, meterReading] = incomingRecord;
        const cost = calculateCost(meterReading, 0, moment(timestamp, DATE_FORMAT).subtract(1, "hour").get("hours"));
        const record = await processEvent(incomingRecord);
        expect(record.cost).equal(cost);
        expect(record.timestamp).equal(timestamp);
        expect(record.meterId).equal(meterId);
        expect(record.meterReading).equal(meterReading);
    });

    it("Cost of a meter after 1 hour.", async function () {
        const persistedRecord = {
            meterId: 1234567,
            timestamp: "2023-10-12T09:00:00",
            meterReading: 555.2,
            cost: 20
        };
        ddbMock.on(QueryCommand).resolves({Items: [persistedRecord]});

        const incomingRecord = [1234567, "2023-10-12T10:00:00", 655.2];
        const [meterId, timestamp, meterReading] = incomingRecord;
        const cost = calculateCost(meterReading, persistedRecord.meterReading, moment(timestamp, DATE_FORMAT).subtract(1, "hour").get("hours"));
        const record = await processEvent(incomingRecord);
        expect(record.cost).equal(cost);
        expect(record.timestamp).equal(timestamp);
        expect(record.meterId).equal(meterId);
        expect(record.meterReading).equal(meterReading);
    });
});

describe("Billing calculation unit tests.", function () {
    beforeEach(function () {
        ddbMock.reset();
    });

    it("Aggregated cost of a meter for a given timespan.", async function () {
        const persistedRecords = {
            Items: [
                {
                    meterId: 1234567,
                    timestamp: "2023-10-12T09:00:00",
                    meterReading: 555.2,
                    cost: 20
                },
                {
                    meterId: 1234567,
                    timestamp: "2023-10-12T10:00:00",
                    meterReading: 1055.2,
                    cost: 100
                },
                {
                    meterId: 1234567,
                    timestamp: "2023-10-12T11:00:00",
                    meterReading: 2155.2,
                    cost: 105.4
                }
            ]
        };
        ddbMock.on(QueryCommand).resolves(persistedRecords);

        const cost = await calculateAggregateCost(1234567, "2023-10-12T09:00:00", "2023-10-12T11:00:00");
        expect(cost).equal(225.4);
    });
});
