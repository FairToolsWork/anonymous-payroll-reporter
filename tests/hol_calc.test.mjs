import { describe, expect, it } from 'vitest'
import {
    holCalcAvgWeekly,
    holCalcExpectedWeeklyPay,
    holCalcExpectedHours,
    holCalcExpectedPay,
} from '../pwa/src/ui/hol_calc.js'

describe('holCalcAvgWeekly', () => {
    it('returns — when hours is 0', () => {
        expect(holCalcAvgWeekly(0)).toBe('—')
    })

    it('returns — when hours is missing', () => {
        expect(holCalcAvgWeekly(null)).toBe('—')
    })

    it('calculates average weekly hours correctly', () => {
        expect(holCalcAvgWeekly(800)).toBe('15.38 hrs')
    })

    it('calculates average weekly hours for exactly 52 weeks', () => {
        expect(holCalcAvgWeekly(520)).toBe('10.00 hrs')
    })
})

describe('holCalcExpectedWeeklyPay', () => {
    it('returns — when hours is 0', () => {
        expect(holCalcExpectedWeeklyPay(0, 12.71)).toBe('—')
    })

    it('returns — when rate is 0', () => {
        expect(holCalcExpectedWeeklyPay(800, 0)).toBe('—')
    })

    it('returns — when both are 0', () => {
        expect(holCalcExpectedWeeklyPay(0, 0)).toBe('—')
    })

    it('calculates expected weekly pay correctly', () => {
        expect(holCalcExpectedWeeklyPay(800, 12.71)).toBe('£195.54')
    })

    it('calculates expected weekly pay for a simple case', () => {
        expect(holCalcExpectedWeeklyPay(520, 10)).toBe('£100.00')
    })
})

describe('holCalcExpectedHours', () => {
    it('returns — when hours is 0', () => {
        expect(holCalcExpectedHours(0, 5, 2)).toBe('—')
    })

    it('returns — when workDaysPerWeek is 0', () => {
        expect(holCalcExpectedHours(800, 0, 2)).toBe('—')
    })

    it('returns — when daysTaken is 0', () => {
        expect(holCalcExpectedHours(800, 5, 0)).toBe('—')
    })

    it('calculates expected hours for 1 day taken', () => {
        expect(holCalcExpectedHours(800, 5, 1)).toBe('3.08 hrs')
    })

    it('calculates expected hours for 2 days taken', () => {
        expect(holCalcExpectedHours(800, 5, 2)).toBe('6.15 hrs')
    })

    it('scales correctly with a 4-day working week', () => {
        expect(holCalcExpectedHours(800, 4, 1)).toBe('3.85 hrs')
    })
})

describe('holCalcExpectedPay', () => {
    it('returns — when hours is 0', () => {
        expect(holCalcExpectedPay(0, 12.71, 5, 2)).toBe('—')
    })

    it('returns — when rate is 0', () => {
        expect(holCalcExpectedPay(800, 0, 5, 2)).toBe('—')
    })

    it('returns — when workDaysPerWeek is 0', () => {
        expect(holCalcExpectedPay(800, 12.71, 0, 2)).toBe('—')
    })

    it('returns — when daysTaken is 0', () => {
        expect(holCalcExpectedPay(800, 12.71, 5, 0)).toBe('—')
    })

    it('calculates expected pay for 1 day taken', () => {
        expect(holCalcExpectedPay(800, 12.71, 5, 1)).toBe('£39.11')
    })

    it('calculates expected pay for 2 days taken', () => {
        expect(holCalcExpectedPay(800, 12.71, 5, 2)).toBe('£78.22')
    })

    it('scales correctly with a 4-day working week', () => {
        expect(holCalcExpectedPay(800, 12.71, 4, 1)).toBe('£48.88')
    })
})
