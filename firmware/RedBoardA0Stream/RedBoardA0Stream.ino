#include <Arduino.h> 
// Streams: millis(), analogRead(A0)\n at ~200 Hz
const uint32_t SAMPLE_US = 5000; // 200 Hz
uint32_t nextTick;

void setup()
{
  Serial.begin(115200);
  nextTick = micros();
}

void loop()
{
  uint32_t now = micros();
  if ((int32_t)(now - nextTick) >= 0)
  {
    nextTick += SAMPLE_US;

    int val = analogRead(A0);   // 0..1023
    unsigned long t = millis(); // ms since boot
    Serial.print(t);
    Serial.print(',');
    Serial.print(val);
    Serial.print('\n');
  }
}
