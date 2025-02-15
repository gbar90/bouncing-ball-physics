class PhysicsBall {
    constructor(canvas) {
        console.log('Initializing PhysicsBall');
        this.canvas = canvas;
        this.width = canvas.width;
        this.height = canvas.height;
        
        // Initialize tachometer properties
        this.currentNeedleAngle = Math.PI * 0.75; // Start at 0 speed
        this.maxSpeed = 10000; // Match our speed limit
        
        // Add obstacle properties
        this.obstacle = {
            x: this.width / 2,
            y: this.height / 2,
            size: 40,
            isDragging: false,
            dragOffsetX: 0,
            dragOffsetY: 0
        };
        
        // Add mouse event handlers for obstacle dragging
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        this.ctx = canvas.getContext('2d');
        if (!this.ctx) {
            console.error('Failed to get 2D context');
            return;
        }
        console.log('Got 2D context');
        
        // Initialize tachometer
        this.tachometer = document.getElementById('tachometerCanvas');
        this.tachCtx = this.tachometer.getContext('2d');
        
        // Sound initialization
        this.audioContext = null;
        this.soundEnabled = false;
        this.lastBounceTime = 0;
        this.minTimeBetweenBounces = 50; // Minimum milliseconds between bounce sounds
        
        // Initialize audio context
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.soundEnabled = true;
        } catch (e) {
            console.error('Failed to initialize audio:', e);
        }
        
        // Container shape
        this.containerShape = 'square';
        this.shapePoints = this.calculateShapePoints();
        
        // Setup controls first so we can initialize from slider values
        this.setupControls();
        
        // Initialize parameters from slider values
        this.initializeFromSliders();
        
        // Initial state
        this.resetState();
        
        // Start the animation
        console.log('Starting animation');
        requestAnimationFrame(this.animate.bind(this));
    }
    
    calculateShapePoints() {
        const padding = 20; // Reduced padding from edges
        const points = {
            square: [
                [padding, padding],
                [this.width - padding, padding],
                [this.width - padding, this.height - padding],
                [padding, this.height - padding]
            ],
            triangle: [
                [this.width / 2, padding],
                [this.width - padding, this.height - padding],
                [padding, this.height - padding]
            ],
            circle: [],
            hexagon: []
        };

        // Calculate circle points (approximated with 32 points)
        const circleRadius = Math.min(this.width, this.height) / 2 - padding;
        const circleCenter = [this.width / 2, this.height / 2];
        for (let i = 0; i < 32; i++) {
            const angle = (i * Math.PI * 2) / 32;
            points.circle.push([
                circleCenter[0] + circleRadius * Math.cos(angle),
                circleCenter[1] + circleRadius * Math.sin(angle)
            ]);
        }

        // Calculate hexagon points
        const hexRadius = Math.min(this.width, this.height) / 2 - padding;
        const hexCenter = [this.width / 2, this.height / 2];
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3 - Math.PI / 6;
            points.hexagon.push([
                hexCenter[0] + hexRadius * Math.cos(angle),
                hexCenter[1] + hexRadius * Math.sin(angle)
            ]);
        }

        return points;
    }

    drawContainer() {
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();

        if (this.containerShape === 'circle' || this.containerShape === 'hexagon') {
            const points = this.shapePoints[this.containerShape];
            this.ctx.moveTo(points[0][0], points[0][1]);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i][0], points[i][1]);
            }
            this.ctx.closePath();
        } else {
            const points = this.shapePoints[this.containerShape];
            this.ctx.moveTo(points[0][0], points[0][1]);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i][0], points[i][1]);
            }
            this.ctx.closePath();
        }
        
        this.ctx.stroke();
    }

    handleCollisions() {
        if (this.containerShape === 'circle') {
            this.handleCircleContainerCollision();
        } else {
            this.handlePolygonContainerCollision();
        }
        
        // Handle collision with obstacle
        this.handleObstacleCollision();
        
        // Enforce speed limit after collisions
        const postCollisionSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (postCollisionSpeed > 10000) {
            const scale = 10000 / postCollisionSpeed;
            this.vx *= scale;
            this.vy *= scale;
        }
    }

    handleCircleContainerCollision() {
        const points = this.shapePoints[this.containerShape];
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = Math.min(this.width, this.height) / 2 - 20;
        
        // Calculate distance from ball center to container center
        const dx = this.x - centerX;
        const dy = this.y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check if ball is outside or touching the container boundary
        const maxDistance = radius - this.radius;
        if (distance >= maxDistance) {
            // Calculate collision normal
            const nx = dx / distance;
            const ny = dy / distance;
            
            // Calculate relative velocity
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            
            // Position correction
            const overlap = distance - maxDistance;
            this.x -= overlap * nx;
            this.y -= overlap * ny;
            
            // Velocity reflection
            const dotProduct = this.vx * nx + this.vy * ny;
            this.vx = (this.vx - 2 * dotProduct * nx) * this.springConstant;
            this.vy = (this.vy - 2 * dotProduct * ny) * this.springConstant;
            
            // Play bounce sound
            this.playBounceSound(speed);
        }
    }

    handlePolygonContainerCollision() {
        let hasCollided = false;
        let maxSpeed = 0;
        
        const points = this.shapePoints[this.containerShape];
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            
            // Calculate normal vector of the wall
            const nx = -(p2[1] - p1[1]);
            const ny = p2[0] - p1[0];
            const len = Math.sqrt(nx * nx + ny * ny);
            const normalX = nx / len;
            const normalY = ny / len;
            
            // Calculate distance from ball to wall
            const distanceToWall = (this.x - p1[0]) * normalX + (this.y - p1[1]) * normalY;
            
            if (Math.abs(distanceToWall) <= this.radius) {
                // Collision detected
                hasCollided = true;
                
                // Calculate speed for sound effect
                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                maxSpeed = Math.max(maxSpeed, speed);
                
                // Position correction
                const overlap = this.radius - Math.abs(distanceToWall);
                this.x += normalX * overlap;
                this.y += normalY * overlap;
                
                // Velocity reflection
                const dotProduct = this.vx * normalX + this.vy * normalY;
                this.vx = (this.vx - 2 * dotProduct * normalX) * this.springConstant;
                this.vy = (this.vy - 2 * dotProduct * normalY) * this.springConstant;
            }
        }
        
        if (hasCollided) {
            this.playBounceSound(maxSpeed);
        }
    }

    handleObstacleCollision() {
        const halfSize = this.obstacle.size / 2;
        const closestX = Math.max(this.obstacle.x - halfSize, 
                                 Math.min(this.x, this.obstacle.x + halfSize));
        const closestY = Math.max(this.obstacle.y - halfSize, 
                                 Math.min(this.y, this.obstacle.y + halfSize));
        
        // Calculate distance between ball and closest point
        const dx = this.x - closestX;
        const dy = this.y - closestY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check for collision
        if (distance < this.radius) {
            // Calculate normal vector
            const nx = dx / distance;
            const ny = dy / distance;
            
            // Calculate relative velocity
            const dotProduct = this.vx * nx + this.vy * ny;
            
            // Apply collision response
            this.vx = (this.vx - 2 * dotProduct * nx) * this.springConstant;
            this.vy = (this.vy - 2 * dotProduct * ny) * this.springConstant;
            
            // Move ball outside obstacle
            const overlap = this.radius - distance;
            this.x += nx * overlap;
            this.y += ny * overlap;
            
            // Play bounce sound
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            this.playBounceSound(speed);
        }
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Check if click is inside obstacle
        if (mouseX >= this.obstacle.x - this.obstacle.size/2 &&
            mouseX <= this.obstacle.x + this.obstacle.size/2 &&
            mouseY >= this.obstacle.y - this.obstacle.size/2 &&
            mouseY <= this.obstacle.y + this.obstacle.size/2) {
            this.obstacle.isDragging = true;
            this.obstacle.dragOffsetX = mouseX - this.obstacle.x;
            this.obstacle.dragOffsetY = mouseY - this.obstacle.y;
        }
    }
    
    handleMouseMove(e) {
        if (this.obstacle.isDragging) {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Update obstacle position
            this.obstacle.x = mouseX - this.obstacle.dragOffsetX;
            this.obstacle.y = mouseY - this.obstacle.dragOffsetY;
            
            // Keep obstacle inside the container
            this.constrainObstacle();
        }
    }
    
    handleMouseUp() {
        this.obstacle.isDragging = false;
    }
    
    constrainObstacle() {
        const padding = 20;
        const halfSize = this.obstacle.size / 2;
        
        if (this.containerShape === 'circle') {
            const centerX = this.width / 2;
            const centerY = this.height / 2;
            const containerRadius = Math.min(this.width, this.height) / 2 - padding;
            
            // Calculate distance from center
            const dx = this.obstacle.x - centerX;
            const dy = this.obstacle.y - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If obstacle is too far from center, move it back
            const maxDistance = containerRadius - halfSize;
            if (distance > maxDistance) {
                const angle = Math.atan2(dy, dx);
                this.obstacle.x = centerX + Math.cos(angle) * maxDistance;
                this.obstacle.y = centerY + Math.sin(angle) * maxDistance;
            }
        } else {
            // For polygon shapes, use simple boundary checking
            const points = this.shapePoints[this.containerShape];
            const minX = Math.min(...points.map(p => p[0])) + padding + halfSize;
            const maxX = Math.max(...points.map(p => p[0])) - padding - halfSize;
            const minY = Math.min(...points.map(p => p[1])) + padding + halfSize;
            const maxY = Math.max(...points.map(p => p[1])) - padding - halfSize;
            
            this.obstacle.x = Math.max(minX, Math.min(maxX, this.obstacle.x));
            this.obstacle.y = Math.max(minY, Math.min(maxY, this.obstacle.y));
        }
    }

    playBounceSound(speed) {
        if (!this.soundEnabled || !this.audioContext) {
            return;
        }
        
        const now = performance.now();
        // Prevent too many sounds playing at once
        if (now - this.lastBounceTime < this.minTimeBetweenBounces) {
            return;
        }
        this.lastBounceTime = now;
        
        try {
            // Create oscillator and gain nodes
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            // Connect nodes
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Set frequency based on ball size (bigger balls = lower pitch)
            const baseFreq = 200;
            const sizeScale = 1 - (this.radius - 5) / 45; // Maps radius 5-50 to 1-0
            oscillator.frequency.value = baseFreq + (sizeScale * 400); // 200-600 Hz range
            
            // Set volume based on collision speed with increased base volume
            const maxSpeed = 2000;
            const volume = Math.min(0.3 + (speed / maxSpeed) * 0.7, 1.0);
            
            // Shape the sound with an envelope
            const now2 = this.audioContext.currentTime;
            gainNode.gain.setValueAtTime(0, now2);
            gainNode.gain.linearRampToValueAtTime(volume, now2 + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now2 + 0.2);
            
            // Start and stop the oscillator
            oscillator.start(now2);
            oscillator.stop(now2 + 0.2);
        } catch (e) {
            console.error('Error playing bounce sound:', e);
            this.soundEnabled = false;
            const soundButton = document.getElementById('soundButton');
            soundButton.textContent = 'Sound Error - Click to Retry';
            soundButton.classList.remove('enabled');
            soundButton.style.background = '#dc3545';
        }
    }

    setupControls() {
        // Get all slider elements
        const sliders = document.querySelectorAll('input[type="range"]');
        
        // Add wheel event listeners to all sliders
        sliders.forEach(slider => {
            slider.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault(); // Prevent page scrolling
                    
                    const step = parseFloat(slider.step) || 1;
                    const multiplier = e.deltaY > 0 ? -1 : 1; // Invert direction
                    const speedMultiplier = e.shiftKey ? 5 : 1; // 5x speed with shift
                    
                    // Calculate new value
                    const newValue = parseFloat(slider.value) + (step * multiplier * speedMultiplier);
                    
                    // Ensure new value is within bounds
                    slider.value = Math.max(
                        parseFloat(slider.min),
                        Math.min(parseFloat(slider.max), newValue)
                    );
                    
                    // Trigger change event
                    slider.dispatchEvent(new Event('input'));
                    slider.dispatchEvent(new Event('change'));
                }
            }, { passive: false });
        });
        
        // Initial X velocity control
        const initialVxSlider = document.getElementById('initialVx');
        const initialVxValue = document.getElementById('initialVxValue');
        initialVxSlider.addEventListener('input', () => {
            this.initialVx = parseFloat(initialVxSlider.value);
            initialVxValue.textContent = this.initialVx;
            this.resetState();
        });
        
        // Initial Y velocity control
        const initialVySlider = document.getElementById('initialVy');
        const initialVyValue = document.getElementById('initialVyValue');
        initialVySlider.addEventListener('input', () => {
            this.initialVy = parseFloat(initialVySlider.value);
            initialVyValue.textContent = this.initialVy;
            this.resetState();
        });
        
        // Gravity control
        const gravitySlider = document.getElementById('gravity');
        const gravityValue = document.getElementById('gravityValue');
        gravitySlider.addEventListener('input', () => {
            this.gravity = parseFloat(gravitySlider.value);
            gravityValue.textContent = this.gravity;
        });
        
        // Mass control
        const massSlider = document.getElementById('mass');
        const massValue = document.getElementById('massValue');
        massSlider.addEventListener('input', () => {
            this.mass = parseFloat(massSlider.value);
            massValue.textContent = this.mass.toFixed(1);
        });
        
        // Radius control
        const radiusSlider = document.getElementById('radius');
        const radiusValue = document.getElementById('radiusValue');
        radiusSlider.addEventListener('input', () => {
            this.radius = parseFloat(radiusSlider.value);
            radiusValue.textContent = this.radius.toFixed(0);
        });
        
        // Spring force control
        const springSlider = document.getElementById('spring');
        const springValue = document.getElementById('springValue');
        springSlider.addEventListener('input', () => {
            this.springConstant = parseFloat(springSlider.value);
            springValue.textContent = this.springConstant.toFixed(2);
        });
        
        // Air resistance control
        const dragSlider = document.getElementById('drag');
        const dragValue = document.getElementById('dragValue');
        dragSlider.addEventListener('input', () => {
            this.dragCoefficient = parseFloat(dragSlider.value);
            dragValue.textContent = this.dragCoefficient.toFixed(3);
        });
        
        // Shape selection
        const shapeButtons = document.querySelectorAll('.shape-button');
        shapeButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Update active button
                shapeButtons.forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                
                // Update shape
                this.containerShape = button.dataset.shape;
                this.shapePoints = this.calculateShapePoints();
                console.log('Changed container shape to:', this.containerShape);
                
                // Reset ball position to ensure it's inside the new shape
                this.resetState();
            });
        });
        
        // Restart button
        const restartButton = document.getElementById('restartButton');
        restartButton.addEventListener('click', () => {
            console.log('Restarting simulation');
            this.resetState();
        });
        
        // Sound button
        const soundButton = document.getElementById('soundButton');
        soundButton.addEventListener('click', () => {
            if (!this.soundEnabled) {
                try {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    this.soundEnabled = true;
                    soundButton.textContent = 'Disable Sound';
                    soundButton.classList.add('enabled');
                    console.log('Sound enabled');
                } catch (e) {
                    console.error('Failed to initialize audio:', e);
                    soundButton.textContent = 'Sound Initialization Failed';
                    soundButton.style.background = '#dc3545';
                }
            } else {
                if (this.audioContext) {
                    this.audioContext.close();
                }
                this.audioContext = null;
                this.soundEnabled = false;
                soundButton.textContent = 'Enable Sound';
                soundButton.classList.remove('enabled');
                console.log('Sound disabled');
            }
        });
    }
    
    initializeFromSliders() {
        // Get all initial values from sliders
        const initialVxSlider = document.getElementById('initialVx');
        const initialVySlider = document.getElementById('initialVy');
        const gravitySlider = document.getElementById('gravity');
        const massSlider = document.getElementById('mass');
        const springSlider = document.getElementById('spring');
        const dragSlider = document.getElementById('drag');
        const radiusSlider = document.getElementById('radius');
        
        this.initialVx = parseFloat(initialVxSlider.value);
        this.initialVy = parseFloat(initialVySlider.value);
        this.gravity = parseFloat(gravitySlider.value);
        this.mass = parseFloat(massSlider.value);
        this.springConstant = parseFloat(springSlider.value);
        this.dragCoefficient = parseFloat(dragSlider.value);
        this.radius = parseFloat(radiusSlider.value);
        
        console.log('Initialized parameters from sliders:', {
            initialVx: this.initialVx,
            initialVy: this.initialVy,
            gravity: this.gravity,
            mass: this.mass,
            spring: this.springConstant,
            drag: this.dragCoefficient,
            radius: this.radius
        });
    }
    
    resetState() {
        // Ball properties are now set from slider
        
        // Set initial position based on container shape
        const padding = 20; // Same padding as container
        const safeOffset = this.radius + padding + 5; // Extra 5px for safety
        
        if (this.containerShape === 'triangle') {
            // For triangle, start below the top point
            this.x = this.width / 2;
            const topY = padding;
            const bottomY = this.height - padding;
            // Position 25% down from the top point
            this.y = topY + (bottomY - topY) * 0.25;
        } else if (this.containerShape === 'circle') {
            // For circle, start slightly above center
            this.x = this.width / 2;
            const centerY = this.height / 2;
            this.y = centerY - this.radius - 20; // Start above center
        } else if (this.containerShape === 'hexagon') {
            // For hexagon, start in center but slightly above
            this.x = this.width / 2;
            this.y = this.height / 2 - this.radius - 20;
        } else {
            // For square, start near but safely away from top-left
            this.x = safeOffset;
            this.y = safeOffset;
        }
        
        // Verify and correct position if needed
        this.enforceContainerBounds();
        
        // Use current initial velocity values
        this.vx = this.initialVx;
        this.vy = this.initialVy;
        
        // Clear any existing trail
        this.trail = [];
    }
    
    draw() {
        console.log('Drawing frame');
        // Clear canvas
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Fill background with transparent color
        this.ctx.fillStyle = 'rgba(240, 240, 240, 0.5)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw container shape with subtle gradient
        this.ctx.beginPath();
        this.drawContainer();
        
        // Create gradient for container
        const gradient = this.ctx.createLinearGradient(0, 0, this.width, this.height);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(1, '#f5f5f5');
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#2171cd';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Draw trail
        this.ctx.beginPath();
        this.trail.forEach((pos, index) => {
            const alpha = index / this.maxTrailLength;
            this.ctx.strokeStyle = `rgba(200, 200, 200, ${alpha * 0.5})`;
            this.ctx.lineWidth = 2;
            if (index === 0) {
                this.ctx.moveTo(pos.x, pos.y);
            } else {
                this.ctx.lineTo(pos.x, pos.y);
            }
        });
        this.ctx.stroke();
        
        // Draw ball shadow
        this.ctx.beginPath();
        this.ctx.ellipse(this.x, this.height - 5, this.radius * 0.8, this.radius * 0.2, 0, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.fill();
        
        // Draw ball
        this.ctx.beginPath();
        this.ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        
        // Create gradient with safe coordinates
        const gradientX = Math.max(this.radius, Math.min(this.x, this.width - this.radius));
        const gradientY = Math.max(this.radius, Math.min(this.y, this.height - this.radius));
        
        try {
            const gradient = this.ctx.createRadialGradient(
                gradientX - this.radius * 0.3,
                gradientY - this.radius * 0.3,
                this.radius * 0.1,
                gradientX,
                gradientY,
                this.radius
            );
            gradient.addColorStop(0, '#fff');
            gradient.addColorStop(1, '#4a90e2');
            this.ctx.fillStyle = gradient;
        } catch (e) {
            console.error('Gradient creation failed:', e);
            this.ctx.fillStyle = '#4a90e2'; // Fallback color
        }
        
        this.ctx.fill();
        this.ctx.strokeStyle = '#2171cd';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Draw obstacle
        this.ctx.fillStyle = '#666';
        this.ctx.fillRect(
            this.obstacle.x - this.obstacle.size/2,
            this.obstacle.y - this.obstacle.size/2,
            this.obstacle.size,
            this.obstacle.size
        );
        
        // Draw tachometer
        this.drawTachometer();
    }
    
    drawTachometer() {
        const ctx = this.tachCtx;
        const width = this.tachometer.width;
        const height = this.tachometer.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 10;
        
        // Clear tachometer
        ctx.clearRect(0, 0, width, height);
        
        // Calculate current speed
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const speedRatio = Math.min(speed / this.maxSpeed, 1);
        
        // Calculate target angle for needle
        const targetAngle = Math.PI * 0.75 + (Math.PI * 1.5 * speedRatio);
        
        // Smoothly animate needle
        const angleSpeed = 0.3; // Adjust for faster/slower needle movement
        const angleDiff = targetAngle - this.currentNeedleAngle;
        this.currentNeedleAngle += angleDiff * angleSpeed;
        
        // Draw background arc
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, Math.PI * 0.75, Math.PI * 2.25, false);
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#eee';
        ctx.stroke();
        
        // Draw speed arc
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, Math.PI * 0.75, 
                Math.PI * 0.75 + (Math.PI * 1.5 * speedRatio), false);
        ctx.lineWidth = 10;
        
        // Create gradient based on speed
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#4CAF50');   // Green
        gradient.addColorStop(0.6, '#FFC107'); // Yellow
        gradient.addColorStop(1, '#F44336');   // Red
        ctx.strokeStyle = gradient;
        ctx.stroke();
        
        // Draw needle
        const needleLength = radius - 20;
        const needleWidth = 3;
        
        // Draw needle shadow
        ctx.save();
        ctx.translate(centerX + 2, centerY + 2);
        ctx.rotate(this.currentNeedleAngle);
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(needleLength, 0);
        ctx.lineWidth = needleWidth;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.stroke();
        ctx.restore();
        
        // Draw needle
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(this.currentNeedleAngle);
        
        // Create needle gradient
        const needleGradient = ctx.createLinearGradient(-10, 0, needleLength, 0);
        needleGradient.addColorStop(0, '#666');
        needleGradient.addColorStop(1, '#333');
        
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(needleLength, 0);
        ctx.lineWidth = needleWidth;
        ctx.strokeStyle = needleGradient;
        ctx.stroke();
        
        // Draw needle base
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fillStyle = needleGradient;
        ctx.fill();
        ctx.restore();
        
        // Draw center point
        ctx.beginPath();
        ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#666';
        ctx.fill();
        
        // Draw speed text
        ctx.fillStyle = '#333';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(speed) + ' px/s', centerX, centerY + 30);
        
        // Draw tick marks
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#333';
        for (let i = 0; i <= 10; i++) {
            const angle = Math.PI * 0.75 + (Math.PI * 1.5 * (i / 10));
            const startRadius = radius - 15;
            const endRadius = i % 5 === 0 ? radius + 5 : radius;
            
            ctx.beginPath();
            ctx.moveTo(
                centerX + Math.cos(angle) * startRadius,
                centerY + Math.sin(angle) * startRadius
            );
            ctx.lineTo(
                centerX + Math.cos(angle) * endRadius,
                centerY + Math.sin(angle) * endRadius
            );
            ctx.stroke();
            
            // Add speed labels for major ticks
            if (i % 5 === 0) {
                const labelRadius = radius + 20;
                const labelX = centerX + Math.cos(angle) * labelRadius;
                const labelY = centerY + Math.sin(angle) * labelRadius;
                ctx.font = '12px Arial';
                ctx.fillStyle = '#666';
                ctx.fillText(Math.round(this.maxSpeed * (i / 10)), labelX, labelY);
            }
        }
    }
    
    update(deltaTime) {
        // Convert deltaTime to seconds and cap it to prevent large jumps
        const dt = Math.min(deltaTime, 100) / 1000;
        
        // Calculate current speed
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        
        // Limit speed to 10000 px/s
        if (speed > 10000) {
            const scale = 10000 / speed;
            this.vx *= scale;
            this.vy *= scale;
        }
        
        // Update tachometer with current speed
        this.updateTachometer(speed);
        
        // Determine number of sub-steps based on speed
        const numSubSteps = Math.ceil(speed / 500); // One extra step per 500px/s of speed
        const subDt = dt / numSubSteps;
        
        for (let i = 0; i < numSubSteps; i++) {
            // Update position
            this.x += this.vx * subDt;
            this.y += this.vy * subDt;
            
            // Apply gravity
            this.vy += this.gravity * subDt;
            
            // Apply air resistance (using time-based decay)
            const dragFactor = Math.pow(1 - this.dragCoefficient, subDt * 60);
            this.vx *= dragFactor;
            this.vy *= dragFactor;
            
            // Handle collisions
            this.handleCollisions();
        }
        
        // Update trail
        if (this.trail.length === 0 || 
            Math.abs(this.x - this.trail[this.trail.length-1].x) > 5 ||
            Math.abs(this.y - this.trail[this.trail.length-1].y) > 5) {
            this.trail.push({x: this.x, y: this.y});
            if (this.trail.length > 20) { // Keep last 20 positions
                this.trail.shift();
            }
        }
        
        // Ensure ball stays in container after all updates
        this.enforceContainerBounds();
    }
    
    updateTachometer(speed) {
        // Update tachometer with current speed
        const speedRatio = Math.min(speed / this.maxSpeed, 1);
        const targetAngle = Math.PI * 0.75 + (Math.PI * 1.5 * speedRatio);
        
        // Smoothly animate needle with improved responsiveness
        const angleSpeed = 0.3; // Increased from 0.15 for faster response
        const angleDiff = targetAngle - this.currentNeedleAngle;
        this.currentNeedleAngle += angleDiff * angleSpeed;
    }
    
    enforceContainerBounds() {
        if (this.containerShape === 'circle') {
            this.enforceCircleBounds();
        } else {
            this.enforcePolygonBounds();
        }
    }
    
    enforceCircleBounds() {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = Math.min(this.width, this.height) / 2 - 20;
        
        // Calculate distance from ball to center
        const dx = this.x - centerX;
        const dy = this.y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // If ball is outside container, move it back in
        const maxDistance = radius - this.radius;
        if (distance > maxDistance) {
            const angle = Math.atan2(dy, dx);
            this.x = centerX + Math.cos(angle) * maxDistance;
            this.y = centerY + Math.sin(angle) * maxDistance;
        }
    }
    
    enforcePolygonBounds() {
        const points = this.shapePoints[this.containerShape];
        let isOutside = false;
        let closestPoint = { x: this.x, y: this.y };
        let minDistance = Infinity;
        
        // Check each edge
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            
            // Calculate normal vector of the wall
            const nx = -(p2[1] - p1[1]);
            const ny = p2[0] - p1[0];
            const len = Math.sqrt(nx * nx + ny * ny);
            const normalX = nx / len;
            const normalY = ny / len;
            
            // Calculate distance from ball to wall
            const distanceToWall = (this.x - p1[0]) * normalX + (this.y - p1[1]) * normalY;
            
            // If ball is outside this wall
            if (distanceToWall < this.radius) {
                isOutside = true;
                
                // Project ball position onto wall and keep track of closest point
                const projectedX = this.x - distanceToWall * normalX;
                const projectedY = this.y - distanceToWall * normalY;
                
                // Calculate distance to projected point
                const dx = projectedX - this.x;
                const dy = projectedY - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestPoint.x = projectedX + normalX * this.radius;
                    closestPoint.y = projectedY + normalY * this.radius;
                }
            }
        }
        
        // If ball was outside any wall, move it to the closest safe position
        if (isOutside) {
            this.x = closestPoint.x;
            this.y = closestPoint.y;
        }
    }
    
    animate(currentTime) {
        if (!currentTime) currentTime = performance.now();
        
        if (this.lastTime === null) {
            this.lastTime = currentTime;
            requestAnimationFrame(this.animate.bind(this));
            return;
        }
        
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        // Only update if enough time has passed (targeting 60 FPS)
        if (deltaTime > 0) {
            this.update(deltaTime);
            this.draw();
        }
        
        requestAnimationFrame(this.animate.bind(this));
    }
}

// Initialize the simulation when the page loads
window.addEventListener('load', () => {
    console.log('Page loaded');
    const canvas = document.getElementById('simulationCanvas');
    if (!canvas) {
        console.error('Could not find canvas element');
        return;
    }
    console.log('Found canvas element');
    const physicsBall = new PhysicsBall(canvas);
    physicsBall.soundEnabled = false;
});
