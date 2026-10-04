// PlayerController.js
//
// Geometry Dash 2.1-style player physics.
//
// Depends on:
//   EntityTypes
//   entityStore
// from Data.js.
//
// Coordinate convention:
//   x = world distance, grows right
//   y = hitbox CENTER, grows downward
//
// Physics is simulated at a fixed 240 Hz step.
// Rendering can run at any frame rate.
//
// IMPORTANT:
// This controller intentionally keeps the existing public API so it can
// replace the old PlayerController without requiring MainHandler changes.
//
// Supported modes:
//   Cube
//   Ship
//   Ball
//   UFO
//   Wave
//   Robot
//   Spider
//
// Supported mechanics:
//   Normal / inverted gravity
//   Mini mode
//   Ground / ceiling bounds
//   Solid surfaces
//   Cube auto-jump
//   Ship hold/release flight
//   Ball gravity switching
//   UFO airborne hops
//   Wave 45-degree movement
//   Robot variable jumps
//   Spider surface teleport
//   Gravity pads
//
// NOTE:
// Geometry Dash's original engine uses internal units and implementation
// details that are not completely documented publicly. These values are
// calibrated around the project's 30 px tile size rather than pretending
// that the game's internal units are literally pixels.


// ============================================================
// Physics constants
// ============================================================

const Physics = {

  // ----------------------------------------------------------
  // Simulation
  // ----------------------------------------------------------

  fixedStep: 1 / 240,

  maxFrameTime: 0.1,

  maxSubSteps: 32,


  // ----------------------------------------------------------
  // Horizontal speed
  // ----------------------------------------------------------

  // Normal 1x gameplay speed for this remake.
  //
  // MainHandler should change this when a speed portal is entered.
  speed: 310,


  // ----------------------------------------------------------
  // General gravity
  // ----------------------------------------------------------

  gravity: 2330,

  terminalVelocity: 1400,


  // ----------------------------------------------------------
  // Cube
  // ----------------------------------------------------------

  cubeJump: 525,


  // ----------------------------------------------------------
  // UFO
  // ----------------------------------------------------------

  // UFO performs a fixed hop on each tap.
  ufoJump: 510,


  // ----------------------------------------------------------
  // Ball
  // ----------------------------------------------------------

  // Ball changes gravity rather than receiving a conventional
  // jump impulse.
  ballGravityMultiplier: 0.9582,


  // ----------------------------------------------------------
  // Ship
  // ----------------------------------------------------------

  shipGravityMultiplier: 0.9582,

  shipThrust: 2450,

  shipGravity: 1750,

  shipMaxVelocity: 850,


  // ----------------------------------------------------------
  // Wave
  // ----------------------------------------------------------

  // Normal Wave = 45 degrees.
  //
  // Vertical speed therefore equals horizontal speed.
  waveVerticalMultiplier: 1,


  // Mini Wave is steeper.
  //
  // slope = 2
  miniWaveVerticalMultiplier: 2,


  // ----------------------------------------------------------
  // Robot
  // ----------------------------------------------------------

  robotGravityMultiplier: 0.9,

  robotMinJump: 300,

  robotMaxJump: 920,

  robotChargeRate: 1500,

  robotMaxCharge: 0.42,


  // ----------------------------------------------------------
  // Spider
  // ----------------------------------------------------------

  spiderHorizontalTolerance: 200,


  // ----------------------------------------------------------
  // Collision
  // ----------------------------------------------------------

  surfaceTolerance: 2,


  // ----------------------------------------------------------
  // Rotation
  // ----------------------------------------------------------

  rotationLerp: 18,

  landSnapRate: 30,

  shipRotationLerp: 12,


  // ----------------------------------------------------------
  // Gameplay
  // ----------------------------------------------------------

  // Small amount of input forgiveness.
  inputBuffer: 0.035,
};


// ============================================================
// Utility
// ============================================================

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}


function lerp(a, b, amount) {
  return a + (b - a) * amount;
}


// ============================================================
// Player
// ============================================================

class Player {

  constructor(startType = EntityTypes.CUBE) {

    this.world = {
      groundY: 0,
      ceilingY: -420,
    };

    this.reset(startType);
  }


  // ==========================================================
  // Entity configuration
  // ==========================================================

  get config() {
    return entityStore[this.type];
  }


  get hitbox() {
    return this.config.hitbox;
  }


  // ==========================================================
  // Size
  // ==========================================================

  get sizeMultiplier() {

    return this.isMini ? 0.6 : 1;
  }


  get width() {

    return this.hitbox.w * this.sizeMultiplier;
  }


  get height() {

    return this.hitbox.h * this.sizeMultiplier;
  }


  // ==========================================================
  // Hitboxes
  // ==========================================================

  get boxBlue() {

    const w = this.width;
    const h = this.height;

    return {
      left: this.x - w / 2,
      right: this.x + w / 2,
      top: this.y - h / 2,
      bottom: this.y + h / 2,
    };
  }


  get boxRed() {

    const base =
      this.config.hazardHitbox ||
      this.hitbox;

    const w = base.w * this.sizeMultiplier;
    const h = base.h * this.sizeMultiplier;

    return {
      left: this.x - w / 2,
      right: this.x + w / 2,
      top: this.y - h / 2,
      bottom: this.y + h / 2,
    };
  }


  get boxRotation() {

    const base =
      this.config.rotationHitbox ||
      this.hitbox;

    const w = base.w * this.sizeMultiplier;
    const h = base.h * this.sizeMultiplier;

    return {
      left: this.x - w / 2,
      right: this.x + w / 2,
      top: this.y - h / 2,
      bottom: this.y + h / 2,
    };
  }


  get left() {
    return this.x - this.width / 2;
  }


  get right() {
    return this.x + this.width / 2;
  }


  get top() {
    return this.y - this.height / 2;
  }


  get bottom() {
    return this.y + this.height / 2;
  }


  // ==========================================================
  // Support
  // ==========================================================

  get isSupported() {

    return (
      this.onGround ||
      this.onCeiling ||
      this.onSolid
    );
  }


  setWorld(world) {

    if (!world) {
      return;
    }

    this.world = {
      ...this.world,
      ...world,
    };
  }


  // ==========================================================
  // Reset
  // ==========================================================

  reset(startType = this.type || EntityTypes.CUBE) {

    this.type = startType;

    this.x = 0;
    this.y = 0;

    this.velocityY = 0;

    this.rotation = 0;
    this.renderRotation = 0;

    this.gravityDir = 1;

    this.isMini = false;

    this.isHolding = false;

    this.holdTime = 0;

    this.inputBufferTime = 0;

    this.onGround = false;
    this.onCeiling = false;
    this.onSolid = false;

    this.alive = true;
    this.finished = false;

    this.spinning = false;

    this.jumpQueued = false;

    this.accumulator = 0;
  }


  // ==========================================================
  // Mode change
  // ==========================================================

  changeMode(newType) {

    const oldGravity =
      this.gravityDir;

    this.type = newType;

    // Mode portals do NOT change gravity.
    this.gravityDir = oldGravity;

    this.velocityY = 0;

    this.holdTime = 0;

    this.inputBufferTime = 0;

    this.jumpQueued = false;

    this.rotation = 0;

    this.renderRotation = 0;

    this.spinning = false;

    this.onGround = false;
    this.onCeiling = false;
    this.onSolid = false;
  }


  // ==========================================================
  // Mini portal support
  // ==========================================================

  setMini(mini) {

    this.isMini = !!mini;

    // Changing size should not create a vertical impulse.
    //
    // Collision resolution will place the player correctly.
    this.onGround = false;
    this.onCeiling = false;
    this.onSolid = false;
  }


  // ==========================================================
  // Input
  // ==========================================================

  handleInputDown(solidObjects = null) {

    this.isHolding = true;

    this.holdTime = 0;

    this.inputBufferTime =
      Physics.inputBuffer;


    switch (this.type) {

      case EntityTypes.CUBE:
        this.tryCubeJump();
        break;


      case EntityTypes.UFO:
        this.ufoJump();
        break;


      case EntityTypes.BALL:
        this.tryBallFlip();
        break;


      case EntityTypes.SPIDER:
        this.trySpiderTeleport(solidObjects);
        break;


      case EntityTypes.ROBOT:
        // Robot stores the hold duration.
        break;


      case EntityTypes.SHIP:
      case EntityTypes.WAVE:
        // Continuous movement is handled in physicsStep().
        break;
    }
  }


  handleInputUp() {

    this.isHolding = false;

    // Robot jump is released at the current charge.
    if (this.type === EntityTypes.ROBOT) {

      if (this.isSupported) {

        const charge =
          clamp(
            this.holdTime /
              Physics.robotMaxCharge,
            0,
            1
          );

        const power =
          lerp(
            Physics.robotMinJump,
            Physics.robotMaxJump,
            charge
          );

        this.velocityY =
          -power * this.gravityDir;

        this.onGround = false;
        this.onCeiling = false;
        this.onSolid = false;
      }

      this.holdTime = 0;

      return;
    }

    this.holdTime = 0;
  }


  // ==========================================================
  // Update
  // ==========================================================

  update(deltaTime, world, solidObjects = null) {

    if (world) {
      this.world = world;
    }

    let frameTime =
      clamp(
        deltaTime,
        0,
        Physics.maxFrameTime
      );

    this.accumulator += frameTime;

    let steps = 0;

    while (
      this.accumulator >= Physics.fixedStep &&
      steps < Physics.maxSubSteps
    ) {

      this.physicsStep(
        Physics.fixedStep,
        solidObjects
      );

      this.accumulator -=
        Physics.fixedStep;

      steps++;
    }

    // Prevent a giant accumulated frame after a stall.
    if (steps >= Physics.maxSubSteps) {
      this.accumulator = 0;
    }

    this.updateVisualRotation(
      frameTime
    );
  }


  // ==========================================================
  // Fixed physics step
  // ==========================================================

  physicsStep(dt, solidObjects = null) {

    if (!this.alive || this.finished) {
      return;
    }


    // --------------------------------------------------------
    // Forward movement
    // --------------------------------------------------------

    this.x +=
      Physics.speed * dt;


    // --------------------------------------------------------
    // Input buffer
    // --------------------------------------------------------

    if (this.inputBufferTime > 0) {

      this.inputBufferTime =
        Math.max(
          0,
          this.inputBufferTime - dt
        );
    }


    // --------------------------------------------------------
    // Mode physics
    // --------------------------------------------------------

    switch (this.type) {

      case EntityTypes.CUBE:
        this.updateCube(dt);
        break;


      case EntityTypes.SHIP:
        this.updateShip(dt);
        break;


      case EntityTypes.BALL:
        this.updateBall(dt);
        break;


      case EntityTypes.UFO:
        this.updateUFO(dt);
        break;


      case EntityTypes.WAVE:
        this.updateWave(dt);
        break;


      case EntityTypes.ROBOT:
        this.updateRobot(dt);
        break;


      case EntityTypes.SPIDER:
        this.updateSpider(dt);
        break;


      default:
        this.updateGravityMode(dt);
        break;
    }


    // --------------------------------------------------------
    // Velocity clamp
    // --------------------------------------------------------

    this.velocityY =
      clamp(
        this.velocityY,
        -Physics.terminalVelocity,
        Physics.terminalVelocity
      );


    // --------------------------------------------------------
    // Vertical movement
    // --------------------------------------------------------

    this.y +=
      this.velocityY * dt;


    // --------------------------------------------------------
    // World collision
    // --------------------------------------------------------

    this.resolveWorldBounds();


    // --------------------------------------------------------
    // Solid collision
    // --------------------------------------------------------

    if (solidObjects) {

      this.resolveSolidCollision(
        solidObjects
      );
    }


    // --------------------------------------------------------
    // Cube hold-to-jump
    // --------------------------------------------------------

    if (
      this.type === EntityTypes.CUBE &&
      this.isHolding &&
      this.isSupported
    ) {

      this.tryCubeJump();
    }


    // --------------------------------------------------------
    // Robot charging
    // --------------------------------------------------------

    if (
      this.type === EntityTypes.ROBOT &&
      this.isHolding &&
      this.isSupported
    ) {

      this.holdTime =
        Math.min(
          this.holdTime + dt,
          Physics.robotMaxCharge
        );

      this.velocityY = 0;
    }
  }


  // ==========================================================
  // Cube
  // ==========================================================

  updateCube(dt) {

    this.velocityY +=
      Physics.gravity *
      this.gravityDir *
      dt;
  }


  tryCubeJump() {

    if (!this.isSupported) {
      return false;
    }

    this.velocityY =
      -Physics.cubeJump *
      this.gravityDir;

    this.onGround = false;
    this.onCeiling = false;
    this.onSolid = false;

    this.spinning = true;

    return true;
  }


  // ==========================================================
  // Ship
  // ==========================================================

  updateShip(dt) {

    const gravity =
      Physics.shipGravity *
      Physics.shipGravityMultiplier;

    if (this.isHolding) {

      this.velocityY -=
        Physics.shipThrust *
        this.gravityDir *
        dt;

    } else {

      this.velocityY +=
        gravity *
        this.gravityDir *
        dt;
    }


    const maxVelocity =
      Physics.shipMaxVelocity *
      (this.isMini ? 1.15 : 1);


    this.velocityY =
      clamp(
        this.velocityY,
        -maxVelocity,
        maxVelocity
      );
  }


  // ==========================================================
  // Ball
  // ==========================================================

  updateBall(dt) {

    const gravity =
      Physics.gravity *
      Physics.ballGravityMultiplier;

    this.velocityY +=
      gravity *
      this.gravityDir *
      dt;
  }


  tryBallFlip() {

    // Ball gravity switching is surface-based.
    if (!this.isSupported) {
      return false;
    }

    this.gravityDir *= -1;

    // Do NOT give the ball an artificial jump impulse.
    this.velocityY = 0;

    this.onGround = false;
    this.onCeiling = false;
    this.onSolid = false;

    return true;
  }


  // ==========================================================
  // UFO
  // ==========================================================

  updateUFO(dt) {

    const gravity =
      Physics.gravity *
      0.9582;

    this.velocityY +=
      gravity *
      this.gravityDir *
      dt;
  }


  ufoJump() {

    this.velocityY =
      -Physics.ufoJump *
      this.gravityDir;

    this.onGround = false;
    this.onCeiling = false;
    this.onSolid = false;
  }


  // ==========================================================
  // Wave
  // ==========================================================

  updateWave() {

    const mini =
      this.isMini;

    const verticalMultiplier =
      mini
        ? Physics.miniWaveVerticalMultiplier
        : Physics.waveVerticalMultiplier;


    // Wave movement is linear.
    //
    // Horizontal speed = gameplay speed.
    // Normal vertical speed = horizontal speed.
    // Mini vertical speed = 2x horizontal speed.

    this.velocityY =
      (
        this.isHolding
          ? -1
          : 1
      ) *
      Physics.speed *
      verticalMultiplier;
  }


  // ==========================================================
  // Robot
  // ==========================================================

  updateRobot(dt) {

    if (
      this.isHolding &&
      this.isSupported
    ) {

      this.velocityY = 0;

      return;
    }


    this.velocityY +=
      Physics.gravity *
      Physics.robotGravityMultiplier *
      this.gravityDir *
      dt;
  }


  // ==========================================================
  // Spider
  // ==========================================================

  updateSpider(dt) {

    // Spider uses normal gravity while travelling.
    this.velocityY +=
      Physics.gravity *
      this.gravityDir *
      dt;
  }


  trySpiderTeleport(solidObjects) {

    // Spider needs surface contact.
    if (!this.isSupported) {
      return false;
    }

    return this.teleportToNearestSurface(
      solidObjects
    );
  }


  // ==========================================================
  // Generic gravity
  // ==========================================================

  updateGravityMode(dt) {

    this.velocityY +=
      Physics.gravity *
      this.gravityDir *
      dt;
  }


  // ==========================================================
  // World bounds
  // ==========================================================

  resolveWorldBounds() {

    const halfHeight =
      this.height / 2;


    const groundLimit =
      this.world.groundY -
      halfHeight;


    const ceilingLimit =
      this.world.ceilingY +
      halfHeight;


    this.onGround = false;
    this.onCeiling = false;


    // --------------------------------------------------------
    // Normal gravity
    // --------------------------------------------------------

    if (
      this.gravityDir === 1 &&
      this.y >= groundLimit
    ) {

      this.y = groundLimit;

      if (this.velocityY > 0) {
        this.velocityY = 0;
      }

      this.onGround = true;
    }


    // --------------------------------------------------------
    // Reverse gravity
    // --------------------------------------------------------

    if (
      this.gravityDir === -1 &&
      this.y <= ceilingLimit
    ) {

      this.y = ceilingLimit;

      if (this.velocityY < 0) {
        this.velocityY = 0;
      }

      this.onCeiling = true;
    }
  }


  // ==========================================================
  // Solid collision
  // ==========================================================

  resolveSolidCollision(objects) {

    const player =
      this.boxBlue;

    let bestSurface = null;


    for (const obj of objects) {

      if (
        obj.type !== 'block' &&
        obj.type !== 'platform'
      ) {
        continue;
      }


      const left =
        obj.x;

      const right =
        obj.x +
        obj.w;

      const top =
        obj.y -
        obj.h;

      const bottom =
        obj.y;


      // Horizontal overlap.
      if (
        player.right < left ||
        player.left > right
      ) {
        continue;
      }


      // ------------------------------------------------------
      // Normal gravity:
      // land on the top of a block.
      // ------------------------------------------------------

      if (
        this.gravityDir === 1 &&
        this.velocityY >= 0
      ) {

        const targetY =
          top -
          this.height / 2;


        const distance =
          targetY -
          this.y;


        if (
          distance >=
            -Physics.surfaceTolerance &&
          distance <=
            Physics.surfaceTolerance +
            Math.abs(this.velocityY) *
              Physics.fixedStep
        ) {

          if (
            !bestSurface ||
            targetY < bestSurface.y
          ) {

            bestSurface = {
              y: targetY,
              type: 'ground',
            };
          }
        }
      }


      // ------------------------------------------------------
      // Reverse gravity:
      // land on the bottom of a block.
      // ------------------------------------------------------

      if (
        this.gravityDir === -1 &&
        this.velocityY <= 0
      ) {

        const targetY =
          bottom +
          this.height / 2;


        const distance =
          targetY -
          this.y;


        if (
          distance <=
            Physics.surfaceTolerance &&
          distance >=
            -(
              Physics.surfaceTolerance +
              Math.abs(this.velocityY) *
                Physics.fixedStep
            )
        ) {

          if (
            !bestSurface ||
            targetY > bestSurface.y
          ) {

            bestSurface = {
              y: targetY,
              type: 'ceiling',
            };
          }
        }
      }
    }


    if (!bestSurface) {
      return;
    }


    this.y =
      bestSurface.y;

    this.velocityY = 0;

    this.onSolid = true;
  }


  // ==========================================================
  // Spider teleport
  // ==========================================================

  teleportToNearestSurface(solidObjects = null) {

    const half =
      this.height / 2;


    const goingUp =
      this.gravityDir === 1;


    let bestY = null;

    let bestDistance =
      Infinity;


    // --------------------------------------------------------
    // World boundary
    // --------------------------------------------------------

    const groundLimit =
      this.world.groundY -
      half;

    const ceilingLimit =
      this.world.ceilingY +
      half;


    if (goingUp) {

      const distance =
        Math.abs(
          this.y -
          ceilingLimit
        );

      if (distance < bestDistance) {

        bestDistance = distance;

        bestY = ceilingLimit;
      }

    } else {

      const distance =
        Math.abs(
          groundLimit -
          this.y
        );

      if (distance < bestDistance) {

        bestDistance = distance;

        bestY = groundLimit;
      }
    }


    // --------------------------------------------------------
    // Blocks
    // --------------------------------------------------------

    if (solidObjects) {

      for (const obj of solidObjects) {

        if (
          obj.type !== 'block' &&
          obj.type !== 'platform'
        ) {
          continue;
        }


        const left =
          obj.x;

        const right =
          obj.x +
          obj.w;


        // Spider must be horizontally aligned
        // with the destination surface.

        if (
          this.x < left -
            Physics.spiderHorizontalTolerance ||
          this.x > right +
            Physics.spiderHorizontalTolerance
        ) {
          continue;
        }


        const top =
          obj.y -
          obj.h;

        const bottom =
          obj.y;


        if (goingUp) {

          const targetY =
            top -
            half;


          if (
            targetY >= this.y
          ) {
            continue;
          }


          const distance =
            this.y -
            targetY;


          if (
            distance <
            bestDistance
          ) {

            bestDistance =
              distance;

            bestY =
              targetY;
          }

        } else {

          const targetY =
            bottom +
            half;


          if (
            targetY <= this.y
          ) {
            continue;
          }


          const distance =
            targetY -
            this.y;


          if (
            distance <
            bestDistance
          ) {

            bestDistance =
              distance;

            bestY =
              targetY;
          }
        }
      }
    }


    if (bestY === null) {
      return false;
    }


    // --------------------------------------------------------
    // Teleport
    // --------------------------------------------------------

    this.y =
      bestY;


    this.gravityDir *= -1;

    this.velocityY = 0;

    this.rotation = 0;

    this.renderRotation = 0;

    this.onGround = false;
    this.onCeiling = false;
    this.onSolid = false;

    return true;
  }


  // ==========================================================
  // Gravity pads
  // ==========================================================

  applyGravityPad() {

    this.gravityDir *= -1;

    // Gravity pads/orbs change gravity.
    // They do not use the Ball's artificial jump impulse.

    this.velocityY = 0;

    this.onGround = false;
    this.onCeiling = false;
    this.onSolid = false;
  }


  // ==========================================================
  // Visual rotation
  // ==========================================================

  updateVisualRotation(deltaTime) {

    const dt =
      clamp(
        deltaTime,
        0,
        Physics.maxFrameTime
      );


    // --------------------------------------------------------
    // Cube
    // --------------------------------------------------------

    if (
      this.type === EntityTypes.CUBE
    ) {

      if (!this.isSupported) {

        // 90 degrees per quarter-jump phase.
        //
        // The exact visual sprite rotation is separate from
        // collision physics.

        const direction =
          this.gravityDir;

        const rotationSpeed =
          7.5 *
          direction;

        this.rotation +=
          rotationSpeed *
          dt;

        this.spinning = true;

        this.renderRotation =
          lerp(
            this.renderRotation,
            this.rotation,
            clamp(
              dt * Physics.rotationLerp,
              0,
              1
            )
          );

      } else {

        this.spinning = false;

        const quarterTurn =
          Math.PI / 2;

        const snapped =
          Math.round(
            this.rotation /
            quarterTurn
          ) *
          quarterTurn;


        this.renderRotation =
          lerp(
            this.renderRotation,
            snapped,
            clamp(
              dt *
                Physics.landSnapRate,
              0,
              1
            )
          );


        if (
          Math.abs(
            this.renderRotation -
            snapped
          ) <
          0.001
        ) {

          this.renderRotation =
            snapped;

          this.rotation =
            snapped;
        }
      }

      return;
    }


    // --------------------------------------------------------
    // Ship
    // --------------------------------------------------------

    if (
      this.type === EntityTypes.SHIP
    ) {

      const maxVelocity =
        Physics.shipMaxVelocity *
        (this.isMini ? 1.15 : 1);


      const normalized =
        clamp(
          this.velocityY /
            maxVelocity,
          -1,
          1
        );


      const maxTilt =
        (
          this.config.maxTilt ||
          30
        ) *
        Math.PI /
        180;


      this.rotation =
        normalized *
        maxTilt;


      this.renderRotation =
        lerp(
          this.renderRotation,
          this.rotation,
          clamp(
            dt *
              Physics.shipRotationLerp,
            0,
            1
          )
        );

      return;
    }


    // --------------------------------------------------------
    // Ball
    // --------------------------------------------------------

    if (
      this.type === EntityTypes.BALL
    ) {

      if (!this.isSupported) {

        const roll =
          this.velocityY *
          0.004;

        this.rotation +=
          roll *
          dt *
          this.gravityDir;

      } else {

        const quarterTurn =
          Math.PI / 2;

        const snapped =
          Math.round(
            this.rotation /
            quarterTurn
          ) *
          quarterTurn;


        this.renderRotation =
          lerp(
            this.renderRotation,
            snapped,
            clamp(
              dt *
                Physics.landSnapRate,
              0,
              1
            )
          );

        this.rotation =
          this.renderRotation;
      }

      return;
    }


    // --------------------------------------------------------
    // Spider
    // --------------------------------------------------------

    if (
      this.type === EntityTypes.SPIDER
    ) {

      this.renderRotation =
        lerp(
          this.renderRotation,
          0,
          clamp(
            dt *
              Physics.rotationLerp,
            0,
            1
          )
        );

      return;
    }


    // --------------------------------------------------------
    // Default
    // --------------------------------------------------------

    this.renderRotation =
      lerp(
        this.renderRotation,
        this.rotation,
        clamp(
          dt *
            Physics.rotationLerp,
          0,
          1
        )
      );
  }
}