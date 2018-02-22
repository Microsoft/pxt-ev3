# threshold

Get the distance threshold for when objects are near, far, or detected.

```sig
sensors.ultrasonic1.threshold(UltrasonicSensorEvent.ObjectDetected)
```

Whether something is near or far away really depends on the situation. A object moving towards you is "near" at further distance than something that isn't moving due to the time necessary to move out of its way.

Distances for near and far by have set _thresholds_. A threshold is a boundary or a limit. If near means anything that's closer that 20 centimeters, then the threshold for ``near``. Also, if anything further than 35 centimeters is thought of as far, then the threshold for ``far`` is `35`.

Also, the threshold for nowing that something has moved within a distance from you is set for ``detected``.

## Parameters

* **condition**: the condition to get the threshold distance for. These are: ``near``, ``far``, and ``detected``.

## Returns

* a [number](/types/number) that is the threshold distance in centimeters.

## Example

When a near object is detected, show what the threshold is.

```blocks
sensors.ultrasonic4.onEvent(UltrasonicSensorEvent.ObjectNear, function () {
    brick.showValue("NearObjectThreshold", sensors.ultrasonic4.threshold(UltrasonicSensorEvent.ObjectNear), 1)
})
```

## See also

[set threshold](/reference/sensors/ultrasonic/set-threshold)