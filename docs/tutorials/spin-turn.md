# Spin Turn

A **spin turn** happens when a [EV3 Driving Base](https://le-www-live-s.legocdn.com/sc/media/lessons/mindstorms-ev3/building-instructions/ev3-rem-driving-base-79bebfc16bd491186ea9c9069842155e.pdf) turns on the spot, by spinning both wheels in opposite directions.

You can achieve turn with a ``tank`` or a ``steer`` block.

```blocks
forever(function() {
    motors.largeBC.tank(50, -50, 2, MoveUnit.Rotations)
    motors.largeBC.tank(-50, 50, 2, MoveUnit.Rotations)
})
```