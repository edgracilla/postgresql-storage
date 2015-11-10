# PostgreSQL Storage Plugin

PostgreSQL Storage Plugin for the Reekoh IoT Platform.

Uses pg npm library

**Assumptions:**

1. Data would be in JSON format
2. Data would be processed based on configuration format
3. Conversions and formatting are done within Reekoh only minimal conversions are done in the plugin
4. Field configuration is correctly done for the specified table

**Process**

1. Data would be written directly to the postgresql host specified
2. Storage plugin will only write data using plain SQL-Insert statement
3. All errors will be logged and no data should be written
4. Data will be parsed accordingly based on field configuration

**Field Configuration**

1. Input for this field is in JSON format {"(field_name)" : {"source_field" : "value", "data_type": "value", "format": "value"}}.
2. field_name will be the name of the column in the postgresql Table
3  source_field (required) value will be the name of the field in the JSON Data passed to the plugin
4  data_type (optional) there are 5 available data types that will convert data to it's proper type before saving
   we have String, Integer, Float, Boolean and DateTime leaving this blank will just use the current data for the field
5. format is only available for DateTime data_type this will allow users to format the date/time before saving
   i.e. (YYYY-MM-DD HH:mm:ss) kindly refer to the moment node module for more details and the accepted format
   of postgresql