// Theme Toggle
    function toggleTheme() {
      const body = document.body;
      const themeIcon = document.getElementById('themeIcon');
      const currentTheme = body.getAttribute('data-theme');
      
      if (currentTheme === 'light') {
        body.setAttribute('data-theme', 'dark');
        themeIcon.className = 'fas fa-sun';
        localStorage.setItem('theme', 'dark');
      } else {
        body.setAttribute('data-theme', 'light');
        themeIcon.className = 'fas fa-moon';
        localStorage.setItem('theme', 'light');
      }
    }

    // Load saved theme
    document.addEventListener('DOMContentLoaded', function() {
      const savedTheme = localStorage.getItem('theme') || 'light';
      const themeIcon = document.getElementById('themeIcon');
      
      document.body.setAttribute('data-theme', savedTheme);
      themeIcon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    });

    function getCommonParams() {
      const h = parseFloat(document.getElementById("common-h").value) / 1000;
      const eps_r = parseFloat(document.getElementById("common-eps").value);
      const t = parseFloat(document.getElementById("common-t").value) * 1e-6;
      const f = parseFloat(document.getElementById("common-f").value);
      return { h, eps_r, t, f };
    }

    function effectiveWidth(W, t, h) {
      if (t <= 0) return W;
      return W + (t / Math.PI) * Math.log(1 + (4 * Math.E * h) / t);
    }

    function effectiveEps(eps_r, h, f) {
      if (eps_r === 1) return 1; // Air/vacuum case
      
      const eps_low = eps_r - 0.2;
      const fp = 3e8 / (4 * h * Math.sqrt(eps_r));
      const fHz = f * 1e9;
      return eps_low + (eps_r - eps_low) * (1 - Math.exp(-fHz / fp));
    }

    function calcZ0_strip(W_mm, params) {
      // Validate inputs
      if (W_mm <= 0 || params.h <= 0 || params.eps_r < 1 || params.t < 0 || params.f < 0) {
        console.error('Invalid parameters:', params);
        return { Z0: NaN, eps_eff: NaN, W_eff: NaN };
      }

      const W = W_mm / 1000;
      const W_eff = effectiveWidth(W, params.t, params.h);
      const eps_eff = effectiveEps(params.eps_r, params.h, params.f);
      
      // Validate intermediate results
      if (W_eff <= 0 || eps_eff < 1 || !isFinite(W_eff) || !isFinite(eps_eff)) {
        console.error('Invalid intermediate results:', { W_eff, eps_eff });
        return { Z0: NaN, eps_eff: NaN, W_eff: NaN };
      }
      
      const denominator = W_eff / params.h + 0.441;
      if (denominator <= 0) {
        console.error('Invalid denominator:', denominator);
        return { Z0: NaN, eps_eff: eps_eff, W_eff: W_eff };
      }
      
      const Z0 = (30 * Math.PI / Math.sqrt(eps_eff)) / denominator;
      
      // Final validation
      if (!isFinite(Z0) || Z0 <= 0) {
        console.error('Invalid Z0:', Z0);
        return { Z0: NaN, eps_eff: eps_eff, W_eff: W_eff };
      }

      console.log('Stripline calculation: W =', W_mm, 'mm → Z₀ =', Z0.toFixed(2), 'Ω, εₑff =', eps_eff.toFixed(3));
      
      return { Z0, eps_eff, W_eff };
    }

    function updateResultValue(elementId, value, unit = '') {
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = value + unit;
        element.classList.add('updated');
        setTimeout(() => element.classList.remove('updated'), 500);
      }
    }

    function clearResults() {
      const resultElements = [
        'z0-value', 'width-value', 'eff-eps-value', 'eff-width-value'
      ];
      
      resultElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          element.textContent = '--' + (id === 'z0-value' ? ' Ω' : 
                                      id === 'width-value' ? ' mm' : 
                                      id === 'eff-width-value' ? ' mm' : '');
        }
      });
    }

    function calculateZ0_fromW() {
      const button = event.target;
      button.classList.add('calculating');
      
      setTimeout(() => {
        try {
          const params = getCommonParams();
          const W_mm = parseFloat(document.getElementById("ms-W-input").value);
          
          if (isNaN(W_mm) || W_mm <= 0) {
            throw new Error('Invalid width value');
          }
          
          const result = calcZ0_strip(W_mm, params);
          
          if (isNaN(result.Z0) || !isFinite(result.Z0)) {
            throw new Error('Invalid calculation result');
          }
          
          // Update individual result values
          updateResultValue('z0-value', result.Z0.toFixed(2), ' Ω');
          updateResultValue('width-value', W_mm.toFixed(3), ' mm');
          updateResultValue('eff-eps-value', result.eps_eff.toFixed(3));
          updateResultValue('eff-width-value', (result.W_eff * 1000).toFixed(4), ' mm');
          
        } catch (error) {
          console.error('Calculation error:', error);
          handleCalculationError(error);
          clearResults();
        }
        
        button.classList.remove('calculating');
      }, 300);
    }

    function findW_for_Z0_strip(targetZ0, params) {
      // Better initial guess based on target impedance
      let W_guess;
      if (targetZ0 > 80) {
        W_guess = params.h * 1000 * 0.3; // Start with narrow width for high impedance
      } else if (targetZ0 > 60) {
        W_guess = params.h * 1000 * 0.6;
      } else if (targetZ0 > 40) {
        W_guess = params.h * 1000 * 1.0;
      } else {
        W_guess = params.h * 1000 * 2.0; // Start with wide width for low impedance
      }
      
      let tol = 1e-8;
      let maxIter = 200;
      let dampingFactor = 0.5; // Add damping for stability
      
      for (let i = 0; i < maxIter; i++) {
        // Check for valid width
        if (W_guess <= 0) {
          W_guess = 0.01;
        }
        if (W_guess > 50) {
          W_guess = 50;
        }
        
        const result = calcZ0_strip(W_guess, params);
        
        // Check if result is valid
        if (isNaN(result.Z0) || !isFinite(result.Z0)) {
          console.error('Invalid Z0 calculated:', result.Z0, 'for W =', W_guess);
          W_guess = W_guess * 0.8; // Try smaller width
          continue;
        }
        
        const f_val = result.Z0 - targetZ0;
        
        if (Math.abs(f_val) < tol) {
          console.log('Converged to W =', W_guess, 'for Z0 =', result.Z0);
          return W_guess;
        }
        
        // Calculate derivative more robustly
        const dW = Math.max(W_guess * 1e-6, 1e-8);
        const W_plus = W_guess + dW;
        const W_minus = W_guess - dW;
        
        // Ensure positive widths
        const W_minus_safe = W_minus <= 0 ? W_guess * 0.1 : W_minus;
        
        const result_plus = calcZ0_strip(W_plus, params);
        const result_minus = calcZ0_strip(W_minus_safe, params);
        
        // Check for valid derivative calculation
        if (isNaN(result_plus.Z0) || isNaN(result_minus.Z0) || 
            !isFinite(result_plus.Z0) || !isFinite(result_minus.Z0)) {
          console.warn('Invalid derivative calculation at iteration', i);
          // Use bisection method as fallback
          if (f_val > 0) {
            W_guess = W_guess * 1.1; // Need wider trace for lower Z0
          } else {
            W_guess = W_guess * 0.9; // Need narrower trace for higher Z0
          }
          continue;
        }
        
        const derivative = (result_plus.Z0 - result_minus.Z0) / (W_plus - W_minus_safe);
        
        if (Math.abs(derivative) < 1e-15) {
          console.warn('Derivative too small at iteration', i);
          // Use bisection method as fallback
          if (f_val > 0) {
            W_guess = W_guess * 1.05;
          } else {
            W_guess = W_guess * 0.95;
          }
          continue;
        }
        
        // Newton-Raphson step with damping
        const W_next = W_guess - dampingFactor * f_val / derivative;
        
        // Ensure reasonable bounds
        const W_next_bounded = Math.max(0.001, Math.min(W_next, 50));
        
        if (Math.abs(W_next_bounded - W_guess) < tol) {
          console.log('Converged to W =', W_next_bounded, 'after', i+1, 'iterations');
          return W_next_bounded;
        }
        
        W_guess = W_next_bounded;
      }
      
      console.error('Failed to converge after', maxIter, 'iterations. Final W =', W_guess);
      return W_guess;
    }

    function calculateW_fromZ0() {
      const button = event.target;
      button.classList.add('calculating');
      
      setTimeout(() => {
        try {
          const params = getCommonParams();
          const targetZ0 = parseFloat(document.getElementById("ms-Z0-input").value);
          
          // Validate input
          if (isNaN(targetZ0) || targetZ0 <= 0) {
            throw new Error('Invalid target impedance value');
          }
          
          console.log('Calculating width for Z0 =', targetZ0);
          
          const W_calc = findW_for_Z0_strip(targetZ0, params);
          
          // Validate result
          if (isNaN(W_calc) || !isFinite(W_calc) || W_calc <= 0) {
            throw new Error('Failed to find valid width');
          }
          
          const result = calcZ0_strip(W_calc, params);
          
          // Validate final result
          if (isNaN(result.Z0) || !isFinite(result.Z0)) {
            throw new Error('Invalid calculation result');
          }
          
          // Update individual result values
          updateResultValue('z0-value', result.Z0.toFixed(2), ' Ω');
          updateResultValue('width-value', W_calc.toFixed(4), ' mm');
          updateResultValue('eff-eps-value', result.eps_eff.toFixed(3));
          updateResultValue('eff-width-value', (result.W_eff * 1000).toFixed(4), ' mm');
          
          console.log('Calculation successful: W =', W_calc, 'mm, Z0 =', result.Z0, 'Ω');
          
        } catch (error) {
          console.error('Calculation error:', error);
          handleCalculationError(error);
          clearResults();
        }
        
        button.classList.remove('calculating');
      }, 300);
    }

    // Enhanced error handling
    function handleCalculationError(error) {
      console.error('Calculation error:', error);
      clearResults();
      
      // Show user-friendly error message
      const errorMsg = document.createElement('div');
      errorMsg.innerHTML = `
        <div style="color: var(--error); text-align: center; padding: 1rem;">
          <i class="fas fa-exclamation-triangle"></i>
          Calculation Error: Please check your input values.
        </div>
      `;
      errorMsg.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--card);
        border: 2px solid var(--error);
        border-radius: var(--radius);
        z-index: 1000;
        animation: fadeInUp 0.3s ease-out;
        box-shadow: var(--shadow-large);
      `;
      document.body.appendChild(errorMsg);
      setTimeout(() => errorMsg.remove(), 3000);
    }

    // Add copy to clipboard functionality
    function copyResult() {
      const results = {
        z0: document.getElementById('z0-value').textContent,
        width: document.getElementById('width-value').textContent,
        eff_eps: document.getElementById('eff-eps-value').textContent,
        eff_width: document.getElementById('eff-width-value').textContent
      };
      
      const resultText = `Stripline Calculation Results:
Characteristic Impedance: ${results.z0}
Required Width: ${results.width}
Effective Dielectric Constant: ${results.eff_eps}
Effective Width: ${results.eff_width}`;
      
      navigator.clipboard.writeText(resultText).then(() => {
        // Show temporary success message
        const button = document.createElement('div');
        button.innerHTML = '<i class="fas fa-check"></i> Results Copied!';
        button.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: var(--success);
          color: white;
          padding: 1rem 1.5rem;
          border-radius: var(--radius);
          z-index: 1000;
          animation: fadeInUp 0.3s ease-out;
          box-shadow: var(--shadow-large);
        `;
        document.body.appendChild(button);
        setTimeout(() => button.remove(), 2000);
      });
    }

    // Add click to copy functionality to result display
    document.addEventListener('DOMContentLoaded', function() {
      const resultDisplay = document.querySelector('.result-display');
      if (resultDisplay) {
        const copyButton = document.createElement('button');
        copyButton.innerHTML = '<i class="fas fa-copy"></i> Copy Results';
        copyButton.className = 'btn btn-secondary';
        copyButton.style.marginTop = '1rem';
        copyButton.onclick = copyResult;
        resultDisplay.appendChild(copyButton);
      }
    });

    // Animation on scroll
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.animationDelay = Math.random() * 0.3 + 's';
          entry.target.classList.add('animate-in');
        }
      });
    }, observerOptions);

    // Observe all cards on page load
    document.addEventListener('DOMContentLoaded', function() {
      document.querySelectorAll('.card').forEach(card => {
        observer.observe(card);
      });
    });

    // Input validation and real-time feedback
    function validateInputs() {
      const inputs = document.querySelectorAll('.input-field');
      inputs.forEach(input => {
        input.addEventListener('input', function() {
          const value = parseFloat(this.value);
          
          // Special validation for dielectric constant (allow εᵣ = 1)
          if (this.id === 'common-eps') {
            if (isNaN(value) || value < 1) {
              this.style.borderColor = 'var(--error)';
            } else {
              this.style.borderColor = 'var(--border)';
            }
          } else {
            // Standard validation for other inputs
            if (isNaN(value) || value <= 0) {
              this.style.borderColor = 'var(--error)';
            } else {
              this.style.borderColor = 'var(--border)';
            }
          }
        });
      });
    }

    // Initialize validation on page load
    document.addEventListener('DOMContentLoaded', validateInputs);

    // Add keyboard shortcuts
    document.addEventListener('keydown', function(event) {
      if (event.ctrlKey || event.metaKey) {
        switch(event.key) {
          case '1':
            event.preventDefault();
            calculateZ0_fromW();
            break;
          case '2':
            event.preventDefault();
            calculateW_fromZ0();
            break;
          case 'd':
            event.preventDefault();
            toggleTheme();
            break;
        }
      }
    });

    // Add tooltips for better UX
    function addTooltips() {
      const tooltips = {
        'common-h': 'Total substrate thickness (distance between ground planes)',
        'common-eps': 'Relative permittivity of the dielectric material (εᵣ ≥ 1, where 1 = air/vacuum)',
        'common-t': 'Metal thickness of the copper trace',
        'common-f': 'Operating frequency for frequency-dependent calculations',
        'ms-W-input': 'Width of the stripline trace',
        'ms-Z0-input': 'Desired characteristic impedance (typically 50Ω)'
      };

      Object.keys(tooltips).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          element.title = tooltips[id];
        }
      });
    }

    // Initialize tooltips
    document.addEventListener('DOMContentLoaded', addTooltips);
