import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { levenshteinDistance2 } from '@/lib/calculateMatch'
import { Button } from "@/components/ui/button"
import { RotateCcw, Star } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { DifficultyLevel, getTextByDifficulty, getTextCount, feedbackMessages } from '@/types/displayTexts'

// Types and Interfaces
interface Word {
  text: string
  status: 'waiting' | 'current' | 'correct' | 'incorrect'
  confidence: number
  isPunctuation: boolean
}

interface TextDisplayProps {
  textToRead: string
  spokenText: string
  isListening?: boolean
  difficulty?: DifficultyLevel
}

// Map of similar-sounding words
const similarSoundingWords: { [key: string]: string[] } = {
  'fun': ['fan'],
  'fan': ['fun'],
  'aloud': ['allowed'],
  'allowed': ['aloud'],
  'there': ['their', 'they\'re'],
  'their': ['there', 'they\'re'],
  'they\'re': ['there', 'their'],
  'to': ['too', 'two'],
  'too': ['to', 'two'],
  'two': ['to', 'too'],
  'write': ['right'],
  'right': ['write'],
  'here': ['hear'],
  'hear': ['here'],
  'tree': ['three'],
  'three': ['tree']
}

export default function TextDisplay({ 
  textToRead = "Sample text", 
  spokenText = "",
  isListening = false,
  difficulty = 'expert'
}: TextDisplayProps) {
  // State Management
  const [words, setWords] = useState<Word[]>([])
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(0)
  const [lastProcessedText, setLastProcessedText] = useState("")
  const [feedback, setFeedback] = useState<string>("")
  const [showFeedback, setShowFeedback] = useState(false)
  const [streak, setStreak] = useState(0)
  const [progress, setProgress] = useState(0)
  const [textIndex, setTextIndex] = useState(0)

  // Utility Functions
  const isPunctuation = useCallback((word: string) => (
    /^[.!?,]+$/.test(word.trim())
  ), [])

  const normalizeText = useCallback((text: string) => (
    text.toLowerCase()
      .replace(/[^a-z0-9\s.!?,]/g, '')
      .replace(/([.!?,])/g, '$1')  
      .replace(/\s+/g, ' ')
      .trim()
  ), [])

  // Get the appropriate text based on difficulty
  const getDisplayText = useCallback(() => {
    return getTextByDifficulty(difficulty, textIndex)
  }, [difficulty, textIndex])

  // Handle text swap
  const handleSwapText = useCallback(() => {
    const maxTexts = getTextCount(difficulty)
    setTextIndex(prev => (prev + 1) % maxTexts)
    setWords([])
    setCurrentWordIndex(0)
    setLastProcessedText("")
    setStreak(0)
    setProgress(0)
  }, [difficulty])

  // Reset Function
  const handleReset = useCallback(() => {
    const cleanText = normalizeText(getDisplayText())
    const initialWords = cleanText.split(' ').map(word => ({
      text: word,
      status: 'waiting',
      confidence: 0,
      isPunctuation: isPunctuation(word)
    }))

    const firstWordIndex = initialWords.findIndex(word => !word.isPunctuation)
    if (firstWordIndex !== -1) {
      initialWords[firstWordIndex].status = 'current'
    }

    setWords(initialWords)
    setCurrentWordIndex(firstWordIndex !== -1 ? firstWordIndex : 0)
    setLastProcessedText("")
  }, [getDisplayText, normalizeText, isPunctuation])

  // Word Processing Functions
  const moveToNextWord = useCallback((words: Word[], currentIndex: number) => {
    let nextIndex = currentIndex + 1
    
    while (nextIndex < words.length && words[nextIndex].isPunctuation) {
      words[nextIndex].status = 'correct'
      words[nextIndex].confidence = 100
      nextIndex++
    }
    
    if (nextIndex < words.length) {
      words[nextIndex].status = 'current'
    }
    
    return nextIndex
  }, [])

  const showRandomFeedback = (isCorrect: boolean) => {
    const messages = isCorrect ? feedbackMessages.great : feedbackMessages.good
    const randomMessage = messages[Math.floor(Math.random() * messages.length)]
    setFeedback(randomMessage)
    setShowFeedback(true)
    setTimeout(() => setShowFeedback(false), 2000)
  }

  // Effects
  useEffect(() => {
    if (!getDisplayText()) return

    const cleanText = normalizeText(getDisplayText())
    const initialWords = cleanText.split(' ').map(word => ({
      text: word,
      status: 'waiting',
      confidence: 0,
      isPunctuation: isPunctuation(word)
    }))

    const firstWordIndex = initialWords.findIndex(word => !word.isPunctuation)
    if (firstWordIndex !== -1) {
      initialWords[firstWordIndex].status = 'current'
    }

    setWords(initialWords)
    setCurrentWordIndex(firstWordIndex !== -1 ? firstWordIndex : 0)
    setLastProcessedText("")
  }, [getDisplayText, normalizeText, isPunctuation])

  useEffect(() => {
    if (!getDisplayText() || !spokenText || !isListening || spokenText === lastProcessedText) return
    
    setLastProcessedText(spokenText)
    const cleanSpokenText = normalizeText(spokenText)
    const spokenWords = cleanSpokenText.split(' ')
    const currentSpokenWord = spokenWords[spokenWords.length - 1]

    if (!currentSpokenWord) return

    setWords(prevWords => {
      const newWords = [...prevWords]
      const currentWord = prevWords[currentWordIndex]

      if (!currentWord || currentWord.status === 'correct' || currentWord.isPunctuation) {
        return prevWords
      }

      const normalizedCurrentWord = normalizeText(currentWord.text)
      const normalizedSpokenWord = normalizeText(currentSpokenWord)
      
      if (difficulty === 'beginner') {
        // Strict matching for beginner level only
        const isExactMatch = normalizedCurrentWord === normalizedSpokenWord
        const confidence = isExactMatch ? 100 : 0

        if (isExactMatch) {
          currentWord.status = 'correct'
          currentWord.confidence = confidence
          const nextIndex = moveToNextWord(newWords, currentWordIndex)
          setCurrentWordIndex(nextIndex)
          setStreak(prev => prev + 1)
          if (streak >= 2) {
            showRandomFeedback(true)
          }
        } else if (currentSpokenWord.length >= 1) {
          currentWord.status = 'incorrect'
          currentWord.confidence = 0
          setStreak(0)
          showRandomFeedback(false)
        }
      } else {
        // Flexible matching for learning and expert levels
        const similarWords = similarSoundingWords[normalizedCurrentWord] || []
        const isSimilarSoundingWord = similarWords.includes(normalizedSpokenWord)

        const distance = levenshteinDistance2(normalizedCurrentWord, normalizedSpokenWord)
        const confidence = Math.max(0, 100 - (distance * 33.33))

        if (distance <= 1 || isSimilarSoundingWord) {
          currentWord.status = 'correct'
          currentWord.confidence = isSimilarSoundingWord ? 100 : confidence
          const nextIndex = moveToNextWord(newWords, currentWordIndex)
          setCurrentWordIndex(nextIndex)
          setStreak(prev => prev + 1)
          if (streak >= 2) {
            showRandomFeedback(true)
          }
        } else if (currentSpokenWord.length >= currentWord.text.length) {
          currentWord.status = 'incorrect'
          currentWord.confidence = confidence
          setStreak(0)
          showRandomFeedback(false)
        } else {
          currentWord.status = 'current'
          currentWord.confidence = confidence
        }
      }

      return newWords
    })
  }, [spokenText, isListening, currentWordIndex, normalizeText, moveToNextWord, difficulty])

  useEffect(() => {
    const correctWords = words.filter(w => w.status === 'correct').length
    const totalWords = words.filter(w => !w.isPunctuation).length
    setProgress(totalWords > 0 ? correctWords / totalWords : 0)
  }, [words])

  // Styling
  const getWordStyle = (word: Word) => {
    const baseStyle = 'px-3 py-2 rounded-lg mx-1 transition-all duration-300 '
    
    if (word.isPunctuation) {
      return baseStyle + (word.status === 'correct' ? 'text-green-500' : 'text-gray-400')
    }
    
    const styles = {
      current: baseStyle + 'bg-yellow-200 animate-pulse text-black font-bold transform scale-110',
      correct: baseStyle + 'bg-green-500 text-white',
      incorrect: baseStyle + 'bg-red-200 text-red-800',
      waiting: baseStyle + 'hover:bg-gray-100'
    }

    return styles[word.status]
  }

  const getConfidenceStyle = (status: 'correct' | 'incorrect') => {
    const baseStyle = {
      position: 'absolute' as const,
      top: '-10px',
      right: '-10px',
      fontSize: '0.65em',
      padding: '2px 6px',
      borderRadius: '9999px', // Makes it fully rounded
      fontWeight: 'bold',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      minWidth: '32px',
      textAlign: 'center' as const,
      transform: 'scale(0.9)',
    }

    if (status === 'correct') {
      return {
        ...baseStyle,
        backgroundColor: '#22c55e', // Green
        color: 'white',
      }
    } else {
      return {
        ...baseStyle,
        backgroundColor: '#ef4444', // Red
        color: 'white',
      }
    }
  }

  return (
    <Card className="w-full max-w-4xl mx-auto shadow-lg relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Start Over
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSwapText}
              className="flex items-center gap-2"
            >
              <Star className="w-4 h-4" />
              Next Text ({textIndex + 1}/{getTextCount(difficulty)})
            </Button>
          </div>
          {progress > 0 && (
            <div className="text-sm font-medium text-gray-500">
              Progress: {Math.round(progress * 100)}%
            </div>
          )}
        </div>

        <AnimatePresence>
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white/90 px-6 py-3 rounded-full shadow-lg text-2xl font-bold text-center z-10"
            >
              {feedback}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="text-3xl leading-relaxed text-center font-rounded">
          {words.map((word, index) => (
            <motion.span 
              key={index} 
              className={getWordStyle(word)}
              style={{
                cursor: 'pointer',
                display: 'inline-block',
                position: 'relative',
                margin: '0 4px'
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {word.text}
              {!word.isPunctuation && " "}
              {word.status === 'current' && isListening && !word.isPunctuation && (
                <motion.span 
                  className="absolute -bottom-1 left-0 w-full h-1 bg-yellow-400"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
              {(word.status === 'correct' || word.status === 'incorrect') && !word.isPunctuation && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-3 right-0 text-xs px-2 py-1 rounded-full font-bold"
                  style={{
                    backgroundColor: word.status === 'correct' ? '#22c55e' : '#ef4444',
                    color: 'white',
                    fontSize: '0.65em'
                  }}
                >
                  {Math.round(word.confidence)}%
                </motion.span>
              )}
            </motion.span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}