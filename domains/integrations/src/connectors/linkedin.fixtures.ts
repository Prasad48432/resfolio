/**
 * Recorded LinkedIn-export CSV shapes (doc 11 fixture discipline) — the
 * column sets and quoting the official data-export ZIP produces, with
 * realistic mess: quoted fields containing commas and newlines, escaped
 * quotes, missing optional columns, and a UTF-8 BOM.
 */

export const positionsCsv =
  "﻿" +
  `Company Name,Title,Description,Location,Started On,Finished On
"Meridian Labs","Senior Software Engineer","Led the platform team.
Shipped the billing rewrite, cut infra spend 30%.","Berlin, Germany",Mar 2021,
"Northwind GmbH","Software Engineer","Built the ""atlas"" ingestion service.","Hamburg, Germany",Jun 2018,Feb 2021
"","Freelance","No company listed — row skipped.","",Jan 2017,May 2018
`;

export const educationCsv = `School Name,Start Date,End Date,Notes,Degree Name,Activities
"Technical University of Munich",2014,2018,"Thesis on distributed tracing.","BSc Computer Science","Robotics club"
`;

export const skillsCsv = `Name
TypeScript
PostgreSQL
Distributed Systems
TypeScript
`;

export const certificationsCsv = `Name,Url,Authority,Started On,Finished On,License Number
"AWS Certified Solutions Architect – Associate",https://www.credly.com/badges/abc,Amazon Web Services,May 2023,,ABC-123
"Unsafe Cert",javascript:alert(1),Evil Corp,Jan 2020,,
`;

export const profileCsv = `First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers
Ada,Lovelace,,,,"Platform engineer <b>at heart</b>","I build quiet, reliable systems.",Software,,"Berlin, Germany",,,
`;
