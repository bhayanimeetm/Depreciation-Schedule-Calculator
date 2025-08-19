document.addEventListener('DOMContentLoaded', () => {
    // --- Setup Event Listeners ---
    document.getElementById('depreciation-form').addEventListener('submit', calculateDepreciationSchedule);
    document.getElementById('clear-btn').addEventListener('click', clearAll);
    
    // Listener for scrap value dropdown change
    document.getElementById('scrap-type').addEventListener('change', handleScrapTypeChange);

    // Set default dates based on current time
    const today = new Date();
    document.getElementById('purchase-date').value = today.toISOString().split('T')[0];
    document.getElementById('analysis-date').value = today.toISOString().split('T')[0];
});

// --- Global variables to store calculation results ---
let scheduleData = [];
let calculationInputs = {};

const formatCurrencyIN = (num) => {
    if (typeof num !== 'number') return '0.00';
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(num);
};

function handleScrapTypeChange() {
    const scrapValueInput = document.getElementById('scrap-value');
    const scrapValueLabel = document.getElementById('scrap-value-label');
    if (this.value === 'percentage') {
        scrapValueLabel.textContent = 'Scrap Value (%)';
        scrapValueInput.value = '5';
        scrapValueInput.max = '100';
    } else {
        scrapValueLabel.textContent = 'Scrap Value (₹)';
        const cost = parseFloat(document.getElementById('asset-cost').value) || 0;
        scrapValueInput.value = (cost * 0.05).toFixed(0);
        scrapValueInput.max = '';
    }
}

function getAndValidateInputs() {
    const cost = parseFloat(document.getElementById('asset-cost').value);
    const purchaseDate = new Date(document.getElementById('purchase-date').value + 'T00:00:00Z');
    const life = parseInt(document.getElementById('useful-life').value);
    const method = document.getElementById('depreciation-method').value;
    const assetName = document.getElementById('asset-name').value || "Unnamed Asset";

    // Read from dropdown list
    const scrapType = document.getElementById('scrap-type').value;
    let scrapValueInput = parseFloat(document.getElementById('scrap-value').value);
    let scrapValue;

    if (scrapType === 'percentage') {
        scrapValue = cost * (scrapValueInput / 100);
    } else {
        scrapValue = scrapValueInput;
    }
    
    if ([cost, life, scrapValue].some(isNaN) || !purchaseDate.getTime()) {
        alert('Please fill all fields with valid numbers and dates.');
        return null;
    }
    if (scrapValue >= cost) {
        alert('Scrap value must be less than the asset cost.');
        return null;
    }

    return { cost, purchaseDate, life, scrapValue, method, assetName };
}

function calculateDepreciationSchedule(event) {
    event.preventDefault();
    const inputs = getAndValidateInputs();
    if (!inputs) return;
    
    calculationInputs = inputs;
    const { cost, purchaseDate, life, scrapValue, method } = inputs;

    let currentWdv = cost;
    scheduleData = [];
    let yearCounter = 0;
    const depreciableBase = cost - scrapValue;
    const assetEndDate = new Date(purchaseDate);
    assetEndDate.setFullYear(assetEndDate.getFullYear() + life);
    const wdvRate = 1 - Math.pow(scrapValue / cost, 1 / life);

    while (currentWdv > scrapValue && Math.abs(currentWdv - scrapValue) > 0.01) {
        yearCounter++;
        const { fyStartDate, fyEndDate, fyString } = getFinancialYear(purchaseDate, yearCounter);
        
        const isFinalYear = assetEndDate <= fyEndDate;
        const effectiveEndDateForDep = isFinalYear ? assetEndDate : fyEndDate;

        if (fyStartDate > effectiveEndDateForDep) break;

        let openingWdv = currentWdv;
        const daysInStandardYear = isLeapYear(fyEndDate.getUTCFullYear()) ? 366 : 365;
        const effectiveStartDateForDep = (yearCounter === 1) ? purchaseDate : fyStartDate;
        const proRataDays = (effectiveEndDateForDep - effectiveStartDateForDep) / (1000 * 3600 * 24) + 1;

        let annualDepreciationRate;
        if (method === 'SLM') {
            annualDepreciationRate = depreciableBase / life;
        } else {
            annualDepreciationRate = openingWdv * wdvRate;
        }
        
        let yearlyDepreciation = (annualDepreciationRate / daysInStandardYear) * Math.max(0, proRataDays);
        
        if (isFinalYear || (openingWdv - yearlyDepreciation) < scrapValue) {
            yearlyDepreciation = openingWdv - scrapValue;
        }

        const closingWdv = openingWdv - yearlyDepreciation;
        const quarterlyDep = calculateQuarterlyBreakdown(yearlyDepreciation, effectiveStartDateForDep, effectiveEndDateForDep, fyStartDate);

        scheduleData.push({ fy: fyString, openingWdv, yearlyDepreciation, q1: quarterlyDep.q1, q2: quarterlyDep.q2, q3: quarterlyDep.q3, q4: quarterlyDep.q4, closingWdv });
        currentWdv = closingWdv;
        if (isFinalYear) break;
    }

    displaySchedule(scheduleData);
    
    // FEATURE: Automatically trigger point-in-time analysis
    calculateValueAtDate();
}

function calculateValueAtDate() {
    const inputs = getAndValidateInputs();
    const analysisDate = new Date(document.getElementById('analysis-date').value + 'T00:00:00Z');
    
    if (!inputs) return;
    if (!analysisDate.getTime()){
        alert("Please select a valid date for analysis.");
        return;
    }
    if (analysisDate < inputs.purchaseDate) {
        // Silently clear the box if date is invalid, instead of alerting
        displayAnalysisResult(0, inputs.cost, analysisDate, true);
        return;
    }

    let accumulatedDep = 0;
    const { cost, purchaseDate, life, scrapValue, method } = inputs;
    const depreciableBase = cost - scrapValue;
    const wdvRate = 1 - Math.pow(scrapValue / cost, 1 / life);
    let wdv = cost;

    for (let i = 0; i < life; i++) {
        const yearStartDate = new Date(purchaseDate);
        yearStartDate.setFullYear(purchaseDate.getFullYear() + i);
        const yearEndDate = new Date(purchaseDate);
        yearEndDate.setFullYear(purchaseDate.getFullYear() + i + 1);

        if (yearStartDate > analysisDate) break;

        const daysInYear = isLeapYear(yearEndDate.getUTCFullYear()) ? 366 : 365;
        let depForYear;
        if (method === 'SLM') {
            depForYear = depreciableBase / life;
        } else {
            depForYear = wdv * wdvRate;
        }

        const dailyDep = depForYear / daysInYear;
        const periodStartDate = (i === 0) ? purchaseDate : yearStartDate;
        const periodEndDate = (analysisDate < yearEndDate) ? analysisDate : yearEndDate;
        
        // FIX: Add +1 to make day counting inclusive and match schedule logic
        const daysToDepreciate = (periodEndDate - periodStartDate) / (1000 * 3600 * 24) + 1;
        
        if (daysToDepreciate > 0) {
            const depreciationThisPeriod = dailyDep * daysToDepreciate;
            accumulatedDep += depreciationThisPeriod;
            wdv -= depreciationThisPeriod;
        }
        
        if (wdv < scrapValue) {
            accumulatedDep -= (scrapValue - wdv);
            wdv = scrapValue;
            break;
        }
    }
    
    displayAnalysisResult(accumulatedDep, wdv, analysisDate);
}


// --- Display and Helper Functions ---

function displaySchedule(schedule) {
    const container = document.getElementById('results-container');
    // Clear previous content and add the fixed title
    container.innerHTML = '<h2>Depreciation Schedule</h2>'; 

    // Create a new div to wrap the table, this will be the scrollable element
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'table-scroll-wrapper';

    let tableHTML = `
        <table class="results-table" id="depreciation-table">
            <thead>
                <tr>
                    <th rowspan="2">Financial Year</th>
                    <th rowspan="2">Opening WDV</th>
                    <th colspan="4">Quarterly Depreciation</th>
                    <th rowspan="2">Total Annual Depreciation</th>
                    <th rowspan="2">Closing WDV</th>
                </tr>
                <tr><th>Q1 (Apr-Jun)</th><th>Q2 (Jul-Sep)</th><th>Q3 (Oct-Dec)</th><th>Q4 (Jan-Mar)</th></tr>
            </thead>
            <tbody>`;

    schedule.forEach(row => {
        tableHTML += `
            <tr class="fy-total-row">
                <td class="col-fy">${row.fy}</td>
                <td>${formatCurrencyIN(row.openingWdv)}</td>
                <td>${formatCurrencyIN(row.q1)}</td>
                <td>${formatCurrencyIN(row.q2)}</td>
                <td>${formatCurrencyIN(row.q3)}</td>
                <td>${formatCurrencyIN(row.q4)}</td>
                <td>${formatCurrencyIN(row.yearlyDepreciation)}</td>
                <td>${formatCurrencyIN(row.closingWdv)}</td>
            </tr>`;
    });

    tableHTML += `</tbody></table>`;
    tableWrapper.innerHTML = tableHTML;
    
    // Append the scrollable wrapper to the main container
    container.appendChild(tableWrapper);
}

function displayAnalysisResult(accumulatedDep, wdv, date, isError = false) {
    const resultBox = document.getElementById('analysis-result');
    resultBox.style.display = 'block';

    if (isError) {
        resultBox.innerHTML = `<p>Analysis date cannot be before the purchase date.</p>`;
        return;
    }
    
    resultBox.innerHTML = `
        <p>As on <strong>${date.toLocaleDateString('en-GB')}</strong>:</p>
        <p>Accumulated Depreciation: <strong>₹ ${formatCurrencyIN(accumulatedDep)}</strong></p>
        <p>Closing WDV: <strong>₹ ${formatCurrencyIN(wdv)}</strong></p>
    `;
}

function clearAll() {
    document.getElementById('depreciation-form').reset();
    document.getElementById('scrap-type').value = 'absolute'; // Reset dropdown
    handleScrapTypeChange.call({ value: 'absolute' });
    const today = new Date();
    document.getElementById('purchase-date').value = today.toISOString().split('T')[0];
    document.getElementById('analysis-date').value = today.toISOString().split('T')[0];
    document.getElementById('results-container').innerHTML = '';
    document.getElementById('analysis-result').style.display = 'none';
    scheduleData = [];
    calculationInputs = {};
}

// --- CORE CALCULATION HELPERS ---
const getFinancialYear = (purchaseDate, yearNum) => {
    let pYear = purchaseDate.getUTCFullYear();
    let pMonth = purchaseDate.getUTCMonth();
    let startYear = (pMonth < 3) ? pYear - 1 : pYear;
    const fyStartDate = new Date(Date.UTC(startYear + yearNum - 1, 3, 1));
    const fyEndDate = new Date(Date.UTC(startYear + yearNum, 2, 31));
    const fyString = `FY ${fyStartDate.getUTCFullYear()}-${fyEndDate.getUTCFullYear().toString().slice(-2)}`;
    return { fyStartDate, fyEndDate, fyString };
};

const calculateQuarterlyBreakdown = (totalDep, effectiveStartDate, effectiveEndDate, fyStartDate) => {
    const q1_start = new Date(Date.UTC(fyStartDate.getUTCFullYear(), 3, 1));
    const q2_start = new Date(Date.UTC(fyStartDate.getUTCFullYear(), 6, 1));
    const q3_start = new Date(Date.UTC(fyStartDate.getUTCFullYear(), 9, 1));
    const q4_start = new Date(Date.UTC(fyStartDate.getUTCFullYear() + 1, 0, 1));
    
    let daysUsedInFY = (effectiveEndDate - effectiveStartDate) / (1000 * 3600 * 24) + 1;
    daysUsedInFY = Math.max(0, daysUsedInFY);

    if (daysUsedInFY <= 0 || totalDep <= 0) return { q1: 0, q2: 0, q3: 0, q4: 0 };
    const depPerDay = totalDep / daysUsedInFY;

    const calcDaysInQuarter = (q_start, q_end) => {
        const start = Math.max(effectiveStartDate.getTime(), q_start.getTime());
        const end = Math.min(effectiveEndDate.getTime(), q_end.getTime());
        return Math.max(0, (end - start) / (1000 * 3600 * 24) + 1);
    };
    
    const daysInQ1 = calcDaysInQuarter(q1_start, new Date(q2_start.getTime() - 1));
    const daysInQ2 = calcDaysInQuarter(q2_start, new Date(q3_start.getTime() - 1));
    const daysInQ3 = calcDaysInQuarter(q3_start, new Date(q4_start.getTime() - 1));
    const daysInQ4 = calcDaysInQuarter(q4_start, new Date(Date.UTC(fyStartDate.getUTCFullYear() + 1, 2, 31)));

    return {
        q1: depPerDay * daysInQ1,
        q2: depPerDay * daysInQ2,
        q3: depPerDay * daysInQ3,
        q4: depPerDay * daysInQ4,
    };
};

const isLeapYear = (year) => (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);