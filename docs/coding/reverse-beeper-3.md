# Reverse Beeper Activity 2

```blocks
let beep = false
beep = true
control.runInBackground(function () {
    motors.largeBC.setSpeed(-20)
    sensors.ultrasonic4.pauseUntil(UltrasonicSensorEvent.ObjectNear)
    motors.largeBC.stop()
    beep = false
})
control.runInBackground(function () {
    while (beep) {
        if (sensors.ultrasonic4.distance() < 20) {
            music.playTone(440, sensors.ultrasonic4.distance())
            loops.pause(50)
        }
    }
})
```
