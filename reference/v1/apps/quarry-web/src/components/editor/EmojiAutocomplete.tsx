/**
 * EmojiAutocomplete - Tiptap extension for :emoji: autocomplete
 *
 * Features:
 * - Triggered by typing `:` followed by characters
 * - Fuzzy search filtering for emoji names
 * - Keyboard navigation (up/down, Enter, Escape)
 * - Converts :shortcode: to Unicode emoji on selection
 *
 * Architecture:
 * - Uses Tiptap Suggestion API (same as slash commands)
 * - Emojis are stored as Unicode characters in Markdown (not shortcodes)
 */

import { Extension } from '@tiptap/core';
import Suggestion, { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance as TippyInstance, Props as TippyProps } from 'tippy.js';
import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from 'react';

// Emoji item type
export interface EmojiItem {
  shortcode: string;
  emoji: string;
  keywords: string[];
}

// Common emojis dataset - a curated list for quick autocomplete
// Stored in a compact format with shortcodes matching common systems (Slack, GitHub)
const EMOJI_DATA: EmojiItem[] = [
  // Smileys
  { shortcode: 'smile', emoji: '😊', keywords: ['happy', 'face', 'joy'] },
  { shortcode: 'grinning', emoji: '😀', keywords: ['happy', 'face', 'smile'] },
  { shortcode: 'laugh', emoji: '😂', keywords: ['joy', 'cry', 'tears', 'lol'] },
  { shortcode: 'joy', emoji: '😂', keywords: ['tears', 'happy', 'lol'] },
  { shortcode: 'rofl', emoji: '🤣', keywords: ['rolling', 'laugh', 'floor'] },
  { shortcode: 'wink', emoji: '😉', keywords: ['face', 'flirt'] },
  { shortcode: 'heart_eyes', emoji: '😍', keywords: ['love', 'face', 'adore'] },
  { shortcode: 'kissing_heart', emoji: '😘', keywords: ['love', 'kiss', 'face'] },
  { shortcode: 'thinking', emoji: '🤔', keywords: ['think', 'face', 'hmm'] },
  { shortcode: 'neutral_face', emoji: '😐', keywords: ['meh', 'blank'] },
  { shortcode: 'expressionless', emoji: '😑', keywords: ['blank', 'face'] },
  { shortcode: 'unamused', emoji: '😒', keywords: ['meh', 'unhappy', 'skeptical'] },
  { shortcode: 'roll_eyes', emoji: '🙄', keywords: ['whatever', 'skeptical'] },
  { shortcode: 'grimacing', emoji: '😬', keywords: ['awkward', 'nervous'] },
  { shortcode: 'relieved', emoji: '😌', keywords: ['calm', 'peaceful'] },
  { shortcode: 'pensive', emoji: '😔', keywords: ['sad', 'thoughtful'] },
  { shortcode: 'sleepy', emoji: '😪', keywords: ['tired', 'face'] },
  { shortcode: 'sleeping', emoji: '😴', keywords: ['zzz', 'tired', 'face'] },
  { shortcode: 'drool', emoji: '🤤', keywords: ['hungry', 'delicious'] },
  { shortcode: 'stuck_out_tongue', emoji: '😛', keywords: ['playful', 'tease'] },
  { shortcode: 'sunglasses', emoji: '😎', keywords: ['cool', 'face'] },
  { shortcode: 'nerd', emoji: '🤓', keywords: ['geek', 'smart', 'glasses'] },
  { shortcode: 'confused', emoji: '😕', keywords: ['puzzled', 'uncertain'] },
  { shortcode: 'worried', emoji: '😟', keywords: ['nervous', 'anxious'] },
  { shortcode: 'frown', emoji: '☹️', keywords: ['sad', 'unhappy'] },
  { shortcode: 'sad', emoji: '😢', keywords: ['cry', 'tear', 'unhappy'] },
  { shortcode: 'sob', emoji: '😭', keywords: ['cry', 'tears', 'sad'] },
  { shortcode: 'angry', emoji: '😠', keywords: ['mad', 'grumpy'] },
  { shortcode: 'rage', emoji: '😡', keywords: ['angry', 'mad', 'red'] },
  { shortcode: 'triumph', emoji: '😤', keywords: ['proud', 'confident'] },
  { shortcode: 'scream', emoji: '😱', keywords: ['fear', 'scared', 'shocked'] },
  { shortcode: 'flushed', emoji: '😳', keywords: ['embarrassed', 'blush'] },
  { shortcode: 'cold_sweat', emoji: '😰', keywords: ['nervous', 'anxious'] },
  { shortcode: 'fearful', emoji: '😨', keywords: ['scared', 'afraid'] },
  { shortcode: 'disappointed', emoji: '😞', keywords: ['sad', 'let down'] },
  { shortcode: 'sweat', emoji: '😓', keywords: ['nervous', 'hard work'] },
  { shortcode: 'weary', emoji: '😩', keywords: ['tired', 'frustrated'] },
  { shortcode: 'tired_face', emoji: '😫', keywords: ['exhausted', 'weary'] },
  { shortcode: 'yawning', emoji: '🥱', keywords: ['tired', 'sleepy', 'bored'] },
  { shortcode: 'hushed', emoji: '😯', keywords: ['surprised', 'quiet'] },
  { shortcode: 'astonished', emoji: '😲', keywords: ['surprised', 'shocked'] },
  { shortcode: 'open_mouth', emoji: '😮', keywords: ['surprised', 'wow'] },
  { shortcode: 'dizzy', emoji: '😵', keywords: ['confused', 'spiral'] },
  { shortcode: 'exploding_head', emoji: '🤯', keywords: ['mind blown', 'shocked'] },
  { shortcode: 'cowboy', emoji: '🤠', keywords: ['hat', 'western'] },
  { shortcode: 'partying', emoji: '🥳', keywords: ['party', 'celebrate'] },
  { shortcode: 'disguised', emoji: '🥸', keywords: ['glasses', 'mustache'] },
  { shortcode: 'shushing', emoji: '🤫', keywords: ['quiet', 'secret', 'shh'] },
  { shortcode: 'lying', emoji: '🤥', keywords: ['pinocchio', 'nose'] },
  { shortcode: 'zipper_mouth', emoji: '🤐', keywords: ['quiet', 'secret'] },
  { shortcode: 'mask', emoji: '😷', keywords: ['sick', 'covid', 'face'] },
  { shortcode: 'face_with_thermometer', emoji: '🤒', keywords: ['sick', 'ill', 'fever'] },
  { shortcode: 'bandage', emoji: '🤕', keywords: ['hurt', 'injured'] },
  { shortcode: 'nauseated', emoji: '🤢', keywords: ['sick', 'green'] },
  { shortcode: 'vomiting', emoji: '🤮', keywords: ['sick', 'throw up'] },
  { shortcode: 'sneezing', emoji: '🤧', keywords: ['sick', 'tissue'] },
  { shortcode: 'hot', emoji: '🥵', keywords: ['warm', 'heat', 'summer'] },
  { shortcode: 'cold', emoji: '🥶', keywords: ['freezing', 'winter'] },
  { shortcode: 'woozy', emoji: '🥴', keywords: ['drunk', 'dizzy'] },
  { shortcode: 'star_struck', emoji: '🤩', keywords: ['amazed', 'stars', 'eyes'] },
  { shortcode: 'zany', emoji: '🤪', keywords: ['crazy', 'silly'] },
  { shortcode: 'upside_down', emoji: '🙃', keywords: ['silly', 'sarcasm'] },
  { shortcode: 'money_mouth', emoji: '🤑', keywords: ['rich', 'dollar'] },
  { shortcode: 'hugging', emoji: '🤗', keywords: ['hug', 'embrace'] },
  { shortcode: 'clown', emoji: '🤡', keywords: ['funny', 'circus'] },
  { shortcode: 'ghost', emoji: '👻', keywords: ['halloween', 'spooky', 'boo'] },
  { shortcode: 'skull', emoji: '💀', keywords: ['death', 'dead', 'skeleton'] },
  { shortcode: 'alien', emoji: '👽', keywords: ['ufo', 'space', 'extraterrestrial'] },
  { shortcode: 'robot', emoji: '🤖', keywords: ['machine', 'bot', 'ai'] },
  { shortcode: 'poop', emoji: '💩', keywords: ['shit', 'crap'] },

  // Gestures
  { shortcode: 'thumbsup', emoji: '👍', keywords: ['yes', 'agree', 'like', '+1'] },
  { shortcode: '+1', emoji: '👍', keywords: ['thumbsup', 'yes', 'agree'] },
  { shortcode: 'thumbsdown', emoji: '👎', keywords: ['no', 'disagree', '-1'] },
  { shortcode: '-1', emoji: '👎', keywords: ['thumbsdown', 'no'] },
  { shortcode: 'ok_hand', emoji: '👌', keywords: ['perfect', 'okay'] },
  { shortcode: 'pinched_fingers', emoji: '🤌', keywords: ['italian', 'chef kiss'] },
  { shortcode: 'pinching_hand', emoji: '🤏', keywords: ['small', 'tiny'] },
  { shortcode: 'victory', emoji: '✌️', keywords: ['peace', 'two'] },
  { shortcode: 'crossed_fingers', emoji: '🤞', keywords: ['luck', 'hope'] },
  { shortcode: 'love_you_gesture', emoji: '🤟', keywords: ['ily', 'rock'] },
  { shortcode: 'call_me', emoji: '🤙', keywords: ['phone', 'shaka'] },
  { shortcode: 'point_left', emoji: '👈', keywords: ['direction'] },
  { shortcode: 'point_right', emoji: '👉', keywords: ['direction'] },
  { shortcode: 'point_up', emoji: '👆', keywords: ['direction'] },
  { shortcode: 'point_down', emoji: '👇', keywords: ['direction'] },
  { shortcode: 'middle_finger', emoji: '🖕', keywords: ['fu', 'flip off'] },
  { shortcode: 'raised_hand', emoji: '✋', keywords: ['stop', 'hi', 'high five'] },
  { shortcode: 'wave', emoji: '👋', keywords: ['hello', 'goodbye', 'hi', 'bye'] },
  { shortcode: 'clap', emoji: '👏', keywords: ['applause', 'bravo'] },
  { shortcode: 'raised_hands', emoji: '🙌', keywords: ['celebration', 'praise'] },
  { shortcode: 'open_hands', emoji: '👐', keywords: ['jazz hands'] },
  { shortcode: 'palms_up', emoji: '🤲', keywords: ['prayer', 'cupped'] },
  { shortcode: 'handshake', emoji: '🤝', keywords: ['deal', 'agreement'] },
  { shortcode: 'pray', emoji: '🙏', keywords: ['thanks', 'please', 'hope'] },
  { shortcode: 'writing_hand', emoji: '✍️', keywords: ['write', 'pen'] },
  { shortcode: 'nail_polish', emoji: '💅', keywords: ['beauty', 'manicure'] },
  { shortcode: 'muscle', emoji: '💪', keywords: ['strong', 'flex', 'bicep'] },
  { shortcode: 'mechanical_arm', emoji: '🦾', keywords: ['prosthetic', 'robot'] },
  { shortcode: 'fist', emoji: '✊', keywords: ['punch', 'power', 'solidarity'] },
  { shortcode: 'fist_bump', emoji: '🤜', keywords: ['punch', 'knucks'] },

  // Hearts
  { shortcode: 'heart', emoji: '❤️', keywords: ['love', 'red'] },
  { shortcode: 'red_heart', emoji: '❤️', keywords: ['love'] },
  { shortcode: 'orange_heart', emoji: '🧡', keywords: ['love'] },
  { shortcode: 'yellow_heart', emoji: '💛', keywords: ['love'] },
  { shortcode: 'green_heart', emoji: '💚', keywords: ['love'] },
  { shortcode: 'blue_heart', emoji: '💙', keywords: ['love'] },
  { shortcode: 'purple_heart', emoji: '💜', keywords: ['love'] },
  { shortcode: 'black_heart', emoji: '🖤', keywords: ['love', 'dark'] },
  { shortcode: 'white_heart', emoji: '🤍', keywords: ['love', 'pure'] },
  { shortcode: 'brown_heart', emoji: '🤎', keywords: ['love'] },
  { shortcode: 'broken_heart', emoji: '💔', keywords: ['sad', 'breakup'] },
  { shortcode: 'sparkling_heart', emoji: '💖', keywords: ['love', 'shiny'] },
  { shortcode: 'growing_heart', emoji: '💗', keywords: ['love', 'pulse'] },
  { shortcode: 'beating_heart', emoji: '💓', keywords: ['love', 'pulse'] },
  { shortcode: 'revolving_hearts', emoji: '💞', keywords: ['love', 'circle'] },
  { shortcode: 'two_hearts', emoji: '💕', keywords: ['love', 'affection'] },
  { shortcode: 'heart_decoration', emoji: '💟', keywords: ['love'] },
  { shortcode: 'heart_exclamation', emoji: '❣️', keywords: ['love', 'heavy'] },

  // Objects & Symbols
  { shortcode: 'fire', emoji: '🔥', keywords: ['hot', 'lit', 'flame'] },
  { shortcode: 'star', emoji: '⭐', keywords: ['favorite', 'rating'] },
  { shortcode: 'sparkles', emoji: '✨', keywords: ['magic', 'new', 'shiny'] },
  { shortcode: 'boom', emoji: '💥', keywords: ['explosion', 'collision'] },
  { shortcode: 'collision', emoji: '💥', keywords: ['boom', 'explosion'] },
  { shortcode: 'sweat_drops', emoji: '💦', keywords: ['water', 'splash'] },
  { shortcode: 'dash', emoji: '💨', keywords: ['wind', 'fast', 'running'] },
  { shortcode: 'dizzy_symbol', emoji: '💫', keywords: ['star', 'sparkle'] },
  { shortcode: 'speech_balloon', emoji: '💬', keywords: ['chat', 'talk', 'comment'] },
  { shortcode: 'thought_balloon', emoji: '💭', keywords: ['think', 'idea'] },
  { shortcode: 'zzz', emoji: '💤', keywords: ['sleep', 'tired'] },
  { shortcode: 'bulb', emoji: '💡', keywords: ['idea', 'light', 'lightbulb'] },
  { shortcode: 'money', emoji: '💰', keywords: ['bag', 'dollar', 'rich'] },
  { shortcode: 'gem', emoji: '💎', keywords: ['diamond', 'precious'] },
  { shortcode: 'gift', emoji: '🎁', keywords: ['present', 'wrapped'] },
  { shortcode: 'trophy', emoji: '🏆', keywords: ['winner', 'award', 'champion'] },
  { shortcode: 'medal', emoji: '🏅', keywords: ['winner', 'award'] },
  { shortcode: 'gold_medal', emoji: '🥇', keywords: ['first', 'winner'] },
  { shortcode: 'silver_medal', emoji: '🥈', keywords: ['second'] },
  { shortcode: 'bronze_medal', emoji: '🥉', keywords: ['third'] },
  { shortcode: 'alarm_clock', emoji: '⏰', keywords: ['time', 'wake'] },
  { shortcode: 'clock', emoji: '🕐', keywords: ['time'] },
  { shortcode: 'hourglass', emoji: '⌛', keywords: ['time', 'timer'] },
  { shortcode: 'watch', emoji: '⌚', keywords: ['time'] },
  { shortcode: 'bell', emoji: '🔔', keywords: ['notification', 'alert'] },
  { shortcode: 'no_bell', emoji: '🔕', keywords: ['quiet', 'mute'] },
  { shortcode: 'megaphone', emoji: '📣', keywords: ['announcement', 'loud'] },
  { shortcode: 'loudspeaker', emoji: '📢', keywords: ['announcement'] },
  { shortcode: 'key', emoji: '🔑', keywords: ['lock', 'password', 'secret'] },
  { shortcode: 'lock', emoji: '🔒', keywords: ['secure', 'private'] },
  { shortcode: 'unlock', emoji: '🔓', keywords: ['open', 'security'] },
  { shortcode: 'link', emoji: '🔗', keywords: ['chain', 'url'] },
  { shortcode: 'pushpin', emoji: '📌', keywords: ['pin', 'location'] },
  { shortcode: 'paperclip', emoji: '📎', keywords: ['attachment'] },
  { shortcode: 'scissors', emoji: '✂️', keywords: ['cut'] },
  { shortcode: 'pencil', emoji: '✏️', keywords: ['write', 'edit'] },
  { shortcode: 'pen', emoji: '🖊️', keywords: ['write'] },
  { shortcode: 'memo', emoji: '📝', keywords: ['note', 'write'] },
  { shortcode: 'book', emoji: '📖', keywords: ['read', 'open'] },
  { shortcode: 'books', emoji: '📚', keywords: ['library', 'read'] },
  { shortcode: 'bookmark', emoji: '🔖', keywords: ['save'] },
  { shortcode: 'calendar', emoji: '📅', keywords: ['date', 'schedule'] },
  { shortcode: 'chart', emoji: '📈', keywords: ['graph', 'increase', 'up'] },
  { shortcode: 'chart_decreasing', emoji: '📉', keywords: ['graph', 'down'] },
  { shortcode: 'bar_chart', emoji: '📊', keywords: ['graph', 'statistics'] },
  { shortcode: 'clipboard', emoji: '📋', keywords: ['list', 'paste'] },
  { shortcode: 'file_folder', emoji: '📁', keywords: ['directory'] },
  { shortcode: 'folder', emoji: '📂', keywords: ['open', 'directory'] },
  { shortcode: 'trash', emoji: '🗑️', keywords: ['delete', 'bin'] },
  { shortcode: 'email', emoji: '📧', keywords: ['mail', 'message'] },
  { shortcode: 'envelope', emoji: '✉️', keywords: ['mail', 'letter'] },
  { shortcode: 'mailbox', emoji: '📬', keywords: ['mail', 'post'] },
  { shortcode: 'package', emoji: '📦', keywords: ['box', 'delivery'] },
  { shortcode: 'label', emoji: '🏷️', keywords: ['tag', 'price'] },
  { shortcode: 'magnifying_glass', emoji: '🔍', keywords: ['search', 'find', 'zoom'] },
  { shortcode: 'microscope', emoji: '🔬', keywords: ['science', 'research'] },
  { shortcode: 'telescope', emoji: '🔭', keywords: ['astronomy', 'space'] },
  { shortcode: 'satellite', emoji: '📡', keywords: ['antenna', 'signal'] },

  // Tech
  { shortcode: 'computer', emoji: '💻', keywords: ['laptop', 'mac', 'pc'] },
  { shortcode: 'desktop', emoji: '🖥️', keywords: ['computer', 'monitor'] },
  { shortcode: 'keyboard', emoji: '⌨️', keywords: ['type', 'computer'] },
  { shortcode: 'mouse', emoji: '🖱️', keywords: ['computer', 'click'] },
  { shortcode: 'phone', emoji: '📱', keywords: ['mobile', 'cell', 'smartphone'] },
  { shortcode: 'telephone', emoji: '☎️', keywords: ['call', 'phone'] },
  { shortcode: 'floppy_disk', emoji: '💾', keywords: ['save', 'storage'] },
  { shortcode: 'cd', emoji: '💿', keywords: ['disk', 'dvd'] },
  { shortcode: 'camera', emoji: '📷', keywords: ['photo', 'picture'] },
  { shortcode: 'video_camera', emoji: '📹', keywords: ['film', 'record'] },
  { shortcode: 'movie_camera', emoji: '🎥', keywords: ['film', 'cinema'] },
  { shortcode: 'tv', emoji: '📺', keywords: ['television', 'watch'] },
  { shortcode: 'radio', emoji: '📻', keywords: ['music', 'broadcast'] },
  { shortcode: 'headphones', emoji: '🎧', keywords: ['music', 'audio'] },
  { shortcode: 'microphone', emoji: '🎤', keywords: ['sing', 'karaoke'] },
  { shortcode: 'speaker', emoji: '🔊', keywords: ['audio', 'loud', 'volume'] },
  { shortcode: 'muted', emoji: '🔇', keywords: ['quiet', 'silent'] },
  { shortcode: 'battery', emoji: '🔋', keywords: ['power', 'charge'] },
  { shortcode: 'plug', emoji: '🔌', keywords: ['electric', 'power'] },
  { shortcode: 'wrench', emoji: '🔧', keywords: ['tool', 'fix', 'settings'] },
  { shortcode: 'hammer', emoji: '🔨', keywords: ['tool', 'build'] },
  { shortcode: 'nut_and_bolt', emoji: '🔩', keywords: ['tool', 'hardware'] },
  { shortcode: 'gear', emoji: '⚙️', keywords: ['settings', 'cog'] },
  { shortcode: 'chains', emoji: '⛓️', keywords: ['link', 'connect'] },

  // Food & Drink
  { shortcode: 'coffee', emoji: '☕', keywords: ['cafe', 'drink', 'hot'] },
  { shortcode: 'tea', emoji: '🍵', keywords: ['drink', 'green'] },
  { shortcode: 'beer', emoji: '🍺', keywords: ['drink', 'alcohol'] },
  { shortcode: 'beers', emoji: '🍻', keywords: ['cheers', 'toast'] },
  { shortcode: 'wine', emoji: '🍷', keywords: ['drink', 'red'] },
  { shortcode: 'cocktail', emoji: '🍸', keywords: ['drink', 'martini'] },
  { shortcode: 'tropical_drink', emoji: '🍹', keywords: ['vacation', 'beach'] },
  { shortcode: 'champagne', emoji: '🍾', keywords: ['celebrate', 'party'] },
  { shortcode: 'pizza', emoji: '🍕', keywords: ['food', 'slice'] },
  { shortcode: 'hamburger', emoji: '🍔', keywords: ['food', 'burger'] },
  { shortcode: 'fries', emoji: '🍟', keywords: ['food', 'french'] },
  { shortcode: 'hotdog', emoji: '🌭', keywords: ['food', 'sausage'] },
  { shortcode: 'taco', emoji: '🌮', keywords: ['food', 'mexican'] },
  { shortcode: 'burrito', emoji: '🌯', keywords: ['food', 'wrap'] },
  { shortcode: 'sushi', emoji: '🍣', keywords: ['food', 'japanese'] },
  { shortcode: 'ramen', emoji: '🍜', keywords: ['food', 'noodles'] },
  { shortcode: 'rice', emoji: '🍚', keywords: ['food', 'bowl'] },
  { shortcode: 'cake', emoji: '🎂', keywords: ['birthday', 'dessert'] },
  { shortcode: 'cookie', emoji: '🍪', keywords: ['food', 'dessert'] },
  { shortcode: 'donut', emoji: '🍩', keywords: ['food', 'dessert'] },
  { shortcode: 'ice_cream', emoji: '🍦', keywords: ['dessert', 'cold'] },
  { shortcode: 'apple', emoji: '🍎', keywords: ['fruit', 'red'] },
  { shortcode: 'banana', emoji: '🍌', keywords: ['fruit', 'yellow'] },
  { shortcode: 'orange', emoji: '🍊', keywords: ['fruit', 'citrus'] },
  { shortcode: 'lemon', emoji: '🍋', keywords: ['fruit', 'sour'] },
  { shortcode: 'grapes', emoji: '🍇', keywords: ['fruit', 'wine'] },
  { shortcode: 'watermelon', emoji: '🍉', keywords: ['fruit', 'summer'] },
  { shortcode: 'strawberry', emoji: '🍓', keywords: ['fruit', 'red'] },
  { shortcode: 'cherries', emoji: '🍒', keywords: ['fruit', 'red'] },
  { shortcode: 'peach', emoji: '🍑', keywords: ['fruit'] },
  { shortcode: 'avocado', emoji: '🥑', keywords: ['fruit', 'green'] },
  { shortcode: 'eggplant', emoji: '🍆', keywords: ['vegetable', 'purple'] },
  { shortcode: 'carrot', emoji: '🥕', keywords: ['vegetable', 'orange'] },
  { shortcode: 'corn', emoji: '🌽', keywords: ['vegetable', 'maize'] },
  { shortcode: 'hot_pepper', emoji: '🌶️', keywords: ['spicy', 'chili'] },
  { shortcode: 'broccoli', emoji: '🥦', keywords: ['vegetable', 'green'] },
  { shortcode: 'egg', emoji: '🥚', keywords: ['food', 'breakfast'] },
  { shortcode: 'bacon', emoji: '🥓', keywords: ['food', 'breakfast'] },
  { shortcode: 'bread', emoji: '🍞', keywords: ['food', 'toast'] },
  { shortcode: 'cheese', emoji: '🧀', keywords: ['food', 'dairy'] },
  { shortcode: 'popcorn', emoji: '🍿', keywords: ['food', 'movie', 'snack'] },
  { shortcode: 'salt', emoji: '🧂', keywords: ['seasoning', 'spice'] },
  { shortcode: 'candy', emoji: '🍬', keywords: ['sweet', 'dessert'] },
  { shortcode: 'chocolate', emoji: '🍫', keywords: ['sweet', 'dessert'] },
  { shortcode: 'lollipop', emoji: '🍭', keywords: ['sweet', 'candy'] },
  { shortcode: 'fork_knife', emoji: '🍴', keywords: ['cutlery', 'eat'] },
  { shortcode: 'spoon', emoji: '🥄', keywords: ['cutlery', 'eat'] },
  { shortcode: 'chopsticks', emoji: '🥢', keywords: ['eat', 'asian'] },

  // Animals
  { shortcode: 'dog', emoji: '🐕', keywords: ['pet', 'animal'] },
  { shortcode: 'cat', emoji: '🐈', keywords: ['pet', 'animal'] },
  { shortcode: 'mouse_face', emoji: '🐭', keywords: ['animal', 'rodent'] },
  { shortcode: 'hamster', emoji: '🐹', keywords: ['animal', 'pet'] },
  { shortcode: 'rabbit', emoji: '🐰', keywords: ['animal', 'bunny'] },
  { shortcode: 'fox', emoji: '🦊', keywords: ['animal'] },
  { shortcode: 'bear', emoji: '🐻', keywords: ['animal'] },
  { shortcode: 'panda', emoji: '🐼', keywords: ['animal', 'bear'] },
  { shortcode: 'koala', emoji: '🐨', keywords: ['animal', 'australia'] },
  { shortcode: 'tiger', emoji: '🐯', keywords: ['animal', 'cat'] },
  { shortcode: 'lion', emoji: '🦁', keywords: ['animal', 'king'] },
  { shortcode: 'cow', emoji: '🐮', keywords: ['animal', 'farm'] },
  { shortcode: 'pig', emoji: '🐷', keywords: ['animal', 'farm'] },
  { shortcode: 'frog', emoji: '🐸', keywords: ['animal', 'amphibian'] },
  { shortcode: 'monkey', emoji: '🐵', keywords: ['animal', 'ape'] },
  { shortcode: 'see_no_evil', emoji: '🙈', keywords: ['monkey', 'blind'] },
  { shortcode: 'hear_no_evil', emoji: '🙉', keywords: ['monkey', 'deaf'] },
  { shortcode: 'speak_no_evil', emoji: '🙊', keywords: ['monkey', 'mute'] },
  { shortcode: 'chicken', emoji: '🐔', keywords: ['animal', 'bird'] },
  { shortcode: 'penguin', emoji: '🐧', keywords: ['animal', 'bird', 'cold'] },
  { shortcode: 'bird', emoji: '🐦', keywords: ['animal', 'fly'] },
  { shortcode: 'eagle', emoji: '🦅', keywords: ['animal', 'bird'] },
  { shortcode: 'duck', emoji: '🦆', keywords: ['animal', 'bird'] },
  { shortcode: 'owl', emoji: '🦉', keywords: ['animal', 'bird', 'night'] },
  { shortcode: 'bat', emoji: '🦇', keywords: ['animal', 'night', 'vampire'] },
  { shortcode: 'wolf', emoji: '🐺', keywords: ['animal', 'dog'] },
  { shortcode: 'horse', emoji: '🐴', keywords: ['animal', 'ride'] },
  { shortcode: 'unicorn', emoji: '🦄', keywords: ['animal', 'magic', 'fantasy'] },
  { shortcode: 'bee', emoji: '🐝', keywords: ['insect', 'honey', 'buzz'] },
  { shortcode: 'butterfly', emoji: '🦋', keywords: ['insect', 'pretty'] },
  { shortcode: 'snail', emoji: '🐌', keywords: ['animal', 'slow'] },
  { shortcode: 'bug', emoji: '🐛', keywords: ['insect', 'caterpillar'] },
  { shortcode: 'ant', emoji: '🐜', keywords: ['insect', 'small'] },
  { shortcode: 'spider', emoji: '🕷️', keywords: ['insect', 'creepy'] },
  { shortcode: 'scorpion', emoji: '🦂', keywords: ['animal', 'sting'] },
  { shortcode: 'crab', emoji: '🦀', keywords: ['animal', 'seafood'] },
  { shortcode: 'lobster', emoji: '🦞', keywords: ['animal', 'seafood'] },
  { shortcode: 'shrimp', emoji: '🦐', keywords: ['animal', 'seafood'] },
  { shortcode: 'squid', emoji: '🦑', keywords: ['animal', 'ocean'] },
  { shortcode: 'octopus', emoji: '🐙', keywords: ['animal', 'ocean'] },
  { shortcode: 'fish', emoji: '🐟', keywords: ['animal', 'ocean'] },
  { shortcode: 'tropical_fish', emoji: '🐠', keywords: ['animal', 'ocean'] },
  { shortcode: 'blowfish', emoji: '🐡', keywords: ['animal', 'fish'] },
  { shortcode: 'shark', emoji: '🦈', keywords: ['animal', 'ocean', 'dangerous'] },
  { shortcode: 'whale', emoji: '🐳', keywords: ['animal', 'ocean', 'big'] },
  { shortcode: 'dolphin', emoji: '🐬', keywords: ['animal', 'ocean', 'smart'] },
  { shortcode: 'crocodile', emoji: '🐊', keywords: ['animal', 'reptile'] },
  { shortcode: 'snake', emoji: '🐍', keywords: ['animal', 'reptile'] },
  { shortcode: 'turtle', emoji: '🐢', keywords: ['animal', 'reptile', 'slow'] },
  { shortcode: 'lizard', emoji: '🦎', keywords: ['animal', 'reptile'] },
  { shortcode: 't_rex', emoji: '🦖', keywords: ['dinosaur', 'extinct'] },
  { shortcode: 'dragon', emoji: '🐉', keywords: ['fantasy', 'mythical'] },

  // Nature
  { shortcode: 'sun', emoji: '☀️', keywords: ['weather', 'sunny', 'bright'] },
  { shortcode: 'moon', emoji: '🌙', keywords: ['night', 'crescent'] },
  { shortcode: 'full_moon', emoji: '🌕', keywords: ['night', 'lunar'] },
  { shortcode: 'star2', emoji: '🌟', keywords: ['shiny', 'bright', 'glow'] },
  { shortcode: 'cloud', emoji: '☁️', keywords: ['weather', 'sky'] },
  { shortcode: 'rain', emoji: '🌧️', keywords: ['weather', 'wet'] },
  { shortcode: 'thunder', emoji: '⛈️', keywords: ['weather', 'storm'] },
  { shortcode: 'snow', emoji: '❄️', keywords: ['weather', 'cold', 'winter'] },
  { shortcode: 'snowflake', emoji: '❄️', keywords: ['cold', 'winter', 'frozen'] },
  { shortcode: 'snowman', emoji: '⛄', keywords: ['winter', 'cold'] },
  { shortcode: 'wind_face', emoji: '🌬️', keywords: ['blow', 'air'] },
  { shortcode: 'tornado', emoji: '🌪️', keywords: ['weather', 'storm'] },
  { shortcode: 'fog', emoji: '🌫️', keywords: ['weather', 'mist'] },
  { shortcode: 'rainbow', emoji: '🌈', keywords: ['weather', 'colorful'] },
  { shortcode: 'umbrella', emoji: '☂️', keywords: ['rain', 'weather'] },
  { shortcode: 'ocean', emoji: '🌊', keywords: ['wave', 'water', 'sea'] },
  { shortcode: 'water', emoji: '💧', keywords: ['drop', 'liquid'] },
  { shortcode: 'flower', emoji: '🌸', keywords: ['cherry', 'blossom', 'spring'] },
  { shortcode: 'sunflower', emoji: '🌻', keywords: ['flower', 'yellow'] },
  { shortcode: 'rose', emoji: '🌹', keywords: ['flower', 'red', 'love'] },
  { shortcode: 'tulip', emoji: '🌷', keywords: ['flower', 'spring'] },
  { shortcode: 'hibiscus', emoji: '🌺', keywords: ['flower', 'tropical'] },
  { shortcode: 'bouquet', emoji: '💐', keywords: ['flowers', 'gift'] },
  { shortcode: 'shamrock', emoji: '☘️', keywords: ['luck', 'irish', 'green'] },
  { shortcode: 'four_leaf_clover', emoji: '🍀', keywords: ['luck', 'lucky'] },
  { shortcode: 'herb', emoji: '🌿', keywords: ['plant', 'green'] },
  { shortcode: 'seedling', emoji: '🌱', keywords: ['plant', 'grow', 'sprout'] },
  { shortcode: 'tree', emoji: '🌳', keywords: ['nature', 'plant'] },
  { shortcode: 'palm_tree', emoji: '🌴', keywords: ['beach', 'tropical'] },
  { shortcode: 'cactus', emoji: '🌵', keywords: ['plant', 'desert'] },
  { shortcode: 'christmas_tree', emoji: '🎄', keywords: ['holiday', 'december'] },
  { shortcode: 'leaves', emoji: '🍃', keywords: ['wind', 'green', 'nature'] },
  { shortcode: 'fallen_leaf', emoji: '🍂', keywords: ['autumn', 'fall'] },
  { shortcode: 'maple_leaf', emoji: '🍁', keywords: ['autumn', 'canada'] },
  { shortcode: 'mushroom', emoji: '🍄', keywords: ['fungus', 'nature'] },
  { shortcode: 'earth', emoji: '🌍', keywords: ['world', 'globe', 'planet'] },
  { shortcode: 'earth_americas', emoji: '🌎', keywords: ['world', 'globe'] },
  { shortcode: 'earth_asia', emoji: '🌏', keywords: ['world', 'globe'] },
  { shortcode: 'globe', emoji: '🌐', keywords: ['world', 'internet', 'web'] },
  { shortcode: 'volcano', emoji: '🌋', keywords: ['mountain', 'eruption'] },
  { shortcode: 'mountain', emoji: '⛰️', keywords: ['nature', 'high'] },
  { shortcode: 'mount_fuji', emoji: '🗻', keywords: ['japan', 'mountain'] },

  // Activities & Sports
  { shortcode: 'soccer', emoji: '⚽', keywords: ['football', 'sport', 'ball'] },
  { shortcode: 'basketball', emoji: '🏀', keywords: ['sport', 'ball'] },
  { shortcode: 'football', emoji: '🏈', keywords: ['american', 'sport'] },
  { shortcode: 'baseball', emoji: '⚾', keywords: ['sport', 'ball'] },
  { shortcode: 'tennis', emoji: '🎾', keywords: ['sport', 'ball'] },
  { shortcode: 'volleyball', emoji: '🏐', keywords: ['sport', 'ball'] },
  { shortcode: 'rugby', emoji: '🏉', keywords: ['sport', 'ball'] },
  { shortcode: 'pool', emoji: '🎱', keywords: ['billiards', 'eight ball'] },
  { shortcode: 'bowling', emoji: '🎳', keywords: ['sport', 'pin'] },
  { shortcode: 'golf', emoji: '⛳', keywords: ['sport', 'flag'] },
  { shortcode: 'dart', emoji: '🎯', keywords: ['target', 'bullseye'] },
  { shortcode: 'ice_skate', emoji: '⛸️', keywords: ['winter', 'sport'] },
  { shortcode: 'ski', emoji: '🎿', keywords: ['winter', 'sport', 'snow'] },
  { shortcode: 'skateboard', emoji: '🛹', keywords: ['sport', 'skate'] },
  { shortcode: 'surfing', emoji: '🏄', keywords: ['sport', 'wave', 'beach'] },
  { shortcode: 'swimming', emoji: '🏊', keywords: ['sport', 'pool'] },
  { shortcode: 'running', emoji: '🏃', keywords: ['sport', 'exercise'] },
  { shortcode: 'biking', emoji: '🚴', keywords: ['sport', 'bicycle', 'cycling'] },
  { shortcode: 'weight_lifting', emoji: '🏋️', keywords: ['sport', 'gym', 'exercise'] },
  { shortcode: 'yoga', emoji: '🧘', keywords: ['exercise', 'meditate', 'zen'] },
  { shortcode: 'martial_arts', emoji: '🥋', keywords: ['karate', 'sport'] },
  { shortcode: 'boxing', emoji: '🥊', keywords: ['glove', 'sport', 'fight'] },
  { shortcode: 'wrestling', emoji: '🤼', keywords: ['sport', 'fight'] },
  { shortcode: 'fencing', emoji: '🤺', keywords: ['sport', 'sword'] },
  { shortcode: 'climbing', emoji: '🧗', keywords: ['sport', 'rock'] },
  { shortcode: 'fishing', emoji: '🎣', keywords: ['sport', 'rod'] },
  { shortcode: 'horse_racing', emoji: '🏇', keywords: ['sport', 'race'] },
  { shortcode: 'checkered_flag', emoji: '🏁', keywords: ['race', 'finish'] },
  { shortcode: 'video_game', emoji: '🎮', keywords: ['gaming', 'controller', 'play'] },
  { shortcode: 'joystick', emoji: '🕹️', keywords: ['gaming', 'arcade'] },
  { shortcode: 'game_die', emoji: '🎲', keywords: ['dice', 'random', 'game'] },
  { shortcode: 'chess', emoji: '♟️', keywords: ['game', 'strategy'] },
  { shortcode: 'jigsaw', emoji: '🧩', keywords: ['puzzle', 'game'] },
  { shortcode: 'teddy_bear', emoji: '🧸', keywords: ['toy', 'stuffed'] },
  { shortcode: 'slot_machine', emoji: '🎰', keywords: ['casino', 'gambling'] },
  { shortcode: 'performing_arts', emoji: '🎭', keywords: ['theater', 'drama', 'masks'] },
  { shortcode: 'art', emoji: '🎨', keywords: ['paint', 'palette', 'creative'] },
  { shortcode: 'ticket', emoji: '🎟️', keywords: ['admission', 'event'] },
  { shortcode: 'balloon', emoji: '🎈', keywords: ['party', 'celebration'] },
  { shortcode: 'confetti_ball', emoji: '🎊', keywords: ['party', 'celebrate'] },
  { shortcode: 'party_popper', emoji: '🎉', keywords: ['party', 'tada', 'celebration'] },
  { shortcode: 'tada', emoji: '🎉', keywords: ['party', 'celebration', 'congrats'] },

  // Travel & Places
  { shortcode: 'car', emoji: '🚗', keywords: ['vehicle', 'drive'] },
  { shortcode: 'taxi', emoji: '🚕', keywords: ['vehicle', 'cab'] },
  { shortcode: 'bus', emoji: '🚌', keywords: ['vehicle', 'transit'] },
  { shortcode: 'ambulance', emoji: '🚑', keywords: ['vehicle', 'emergency'] },
  { shortcode: 'fire_engine', emoji: '🚒', keywords: ['vehicle', 'emergency'] },
  { shortcode: 'police_car', emoji: '🚓', keywords: ['vehicle', 'emergency'] },
  { shortcode: 'truck', emoji: '🚚', keywords: ['vehicle', 'delivery'] },
  { shortcode: 'train', emoji: '🚆', keywords: ['vehicle', 'transit', 'rail'] },
  { shortcode: 'metro', emoji: '🚇', keywords: ['subway', 'transit'] },
  { shortcode: 'bike', emoji: '🚲', keywords: ['bicycle', 'cycle'] },
  { shortcode: 'motorcycle', emoji: '🏍️', keywords: ['vehicle', 'motorbike'] },
  { shortcode: 'scooter', emoji: '🛴', keywords: ['vehicle', 'kick'] },
  { shortcode: 'airplane', emoji: '✈️', keywords: ['flight', 'travel', 'plane'] },
  { shortcode: 'helicopter', emoji: '🚁', keywords: ['vehicle', 'fly'] },
  { shortcode: 'rocket', emoji: '🚀', keywords: ['space', 'launch', 'fast'] },
  { shortcode: 'ufo', emoji: '🛸', keywords: ['alien', 'space', 'flying saucer'] },
  { shortcode: 'ship', emoji: '🚢', keywords: ['boat', 'cruise'] },
  { shortcode: 'sailboat', emoji: '⛵', keywords: ['boat', 'sailing'] },
  { shortcode: 'anchor', emoji: '⚓', keywords: ['boat', 'ship', 'nautical'] },
  { shortcode: 'fuel_pump', emoji: '⛽', keywords: ['gas', 'petrol'] },
  { shortcode: 'construction', emoji: '🚧', keywords: ['barrier', 'work'] },
  { shortcode: 'traffic_light', emoji: '🚦', keywords: ['signal', 'stop'] },
  { shortcode: 'house', emoji: '🏠', keywords: ['home', 'building'] },
  { shortcode: 'office', emoji: '🏢', keywords: ['building', 'work'] },
  { shortcode: 'hospital', emoji: '🏥', keywords: ['building', 'medical'] },
  { shortcode: 'bank', emoji: '🏦', keywords: ['building', 'money'] },
  { shortcode: 'hotel', emoji: '🏨', keywords: ['building', 'travel'] },
  { shortcode: 'school', emoji: '🏫', keywords: ['building', 'education'] },
  { shortcode: 'church', emoji: '⛪', keywords: ['building', 'religion'] },
  { shortcode: 'mosque', emoji: '🕌', keywords: ['building', 'religion'] },
  { shortcode: 'synagogue', emoji: '🕍', keywords: ['building', 'religion'] },
  { shortcode: 'castle', emoji: '🏰', keywords: ['building', 'medieval'] },
  { shortcode: 'statue_of_liberty', emoji: '🗽', keywords: ['usa', 'new york'] },
  { shortcode: 'tokyo_tower', emoji: '🗼', keywords: ['japan', 'landmark'] },
  { shortcode: 'eiffel', emoji: '🗼', keywords: ['paris', 'france'] },
  { shortcode: 'tent', emoji: '⛺', keywords: ['camping', 'outdoor'] },
  { shortcode: 'ferris_wheel', emoji: '🎡', keywords: ['amusement', 'park'] },
  { shortcode: 'roller_coaster', emoji: '🎢', keywords: ['amusement', 'park'] },
  { shortcode: 'carousel', emoji: '🎠', keywords: ['amusement', 'horse'] },
  { shortcode: 'beach_umbrella', emoji: '🏖️', keywords: ['vacation', 'sun'] },
  { shortcode: 'camping', emoji: '🏕️', keywords: ['outdoor', 'tent'] },
  { shortcode: 'sunrise', emoji: '🌅', keywords: ['morning', 'dawn'] },
  { shortcode: 'sunset', emoji: '🌇', keywords: ['evening', 'dusk'] },
  { shortcode: 'night', emoji: '🌃', keywords: ['city', 'dark', 'stars'] },
  { shortcode: 'milky_way', emoji: '🌌', keywords: ['space', 'galaxy', 'stars'] },

  // Symbols
  { shortcode: 'check', emoji: '✅', keywords: ['yes', 'done', 'success'] },
  { shortcode: 'white_check_mark', emoji: '✅', keywords: ['yes', 'done'] },
  { shortcode: 'heavy_check_mark', emoji: '✔️', keywords: ['yes', 'done'] },
  { shortcode: 'x', emoji: '❌', keywords: ['no', 'wrong', 'error', 'cross'] },
  { shortcode: 'cross_mark', emoji: '❌', keywords: ['no', 'wrong'] },
  { shortcode: 'question', emoji: '❓', keywords: ['what', 'help'] },
  { shortcode: 'exclamation', emoji: '❗', keywords: ['important', 'alert'] },
  { shortcode: 'warning', emoji: '⚠️', keywords: ['alert', 'caution'] },
  { shortcode: 'no_entry', emoji: '⛔', keywords: ['stop', 'forbidden'] },
  { shortcode: 'prohibited', emoji: '🚫', keywords: ['no', 'forbidden', 'banned'] },
  { shortcode: 'infinity', emoji: '♾️', keywords: ['forever', 'endless'] },
  { shortcode: 'recycle', emoji: '♻️', keywords: ['green', 'environment'] },
  { shortcode: 'atom', emoji: '⚛️', keywords: ['science', 'physics'] },
  { shortcode: 'fleur_de_lis', emoji: '⚜️', keywords: ['symbol', 'scout'] },
  { shortcode: 'trident', emoji: '🔱', keywords: ['symbol', 'weapon'] },
  { shortcode: 'name_badge', emoji: '📛', keywords: ['id', 'tag'] },
  { shortcode: 'beginner', emoji: '🔰', keywords: ['symbol', 'new'] },
  { shortcode: 'o', emoji: '⭕', keywords: ['circle', 'ring'] },
  { shortcode: 'multiply', emoji: '✖️', keywords: ['math', 'times', 'x'] },
  { shortcode: 'plus', emoji: '➕', keywords: ['math', 'add'] },
  { shortcode: 'minus', emoji: '➖', keywords: ['math', 'subtract'] },
  { shortcode: 'divide', emoji: '➗', keywords: ['math', 'division'] },
  { shortcode: 'equals', emoji: '🟰', keywords: ['math', 'same'] },
  { shortcode: 'curly_loop', emoji: '➰', keywords: ['loop', 'spiral'] },
  { shortcode: 'double_curly_loop', emoji: '➿', keywords: ['loop', 'spiral'] },
  { shortcode: 'part_alternation_mark', emoji: '〽️', keywords: ['symbol'] },
  { shortcode: 'eight_spoked_asterisk', emoji: '✳️', keywords: ['symbol', 'star'] },
  { shortcode: 'eight_pointed_star', emoji: '✴️', keywords: ['symbol', 'star'] },
  { shortcode: 'sparkle', emoji: '❇️', keywords: ['symbol', 'star'] },
  { shortcode: 'bangbang', emoji: '‼️', keywords: ['exclamation', 'important'] },
  { shortcode: 'interrobang', emoji: '⁉️', keywords: ['question', 'exclamation'] },
  { shortcode: 'copyright', emoji: '©️', keywords: ['ip', 'legal'] },
  { shortcode: 'registered', emoji: '®️', keywords: ['ip', 'legal'] },
  { shortcode: 'tm', emoji: '™️', keywords: ['trademark', 'legal'] },
  { shortcode: 'hash', emoji: '#️⃣', keywords: ['number', 'pound'] },
  { shortcode: 'asterisk', emoji: '*️⃣', keywords: ['symbol', 'star'] },
  { shortcode: 'zero', emoji: '0️⃣', keywords: ['number', 'digit'] },
  { shortcode: 'one', emoji: '1️⃣', keywords: ['number', 'digit'] },
  { shortcode: 'two', emoji: '2️⃣', keywords: ['number', 'digit'] },
  { shortcode: 'three', emoji: '3️⃣', keywords: ['number', 'digit'] },
  { shortcode: 'four', emoji: '4️⃣', keywords: ['number', 'digit'] },
  { shortcode: 'five', emoji: '5️⃣', keywords: ['number', 'digit'] },
  { shortcode: 'six', emoji: '6️⃣', keywords: ['number', 'digit'] },
  { shortcode: 'seven', emoji: '7️⃣', keywords: ['number', 'digit'] },
  { shortcode: 'eight', emoji: '8️⃣', keywords: ['number', 'digit'] },
  { shortcode: 'nine', emoji: '9️⃣', keywords: ['number', 'digit'] },
  { shortcode: 'keycap_ten', emoji: '🔟', keywords: ['number', 'digit'] },
  { shortcode: 'hundred', emoji: '💯', keywords: ['score', 'perfect', '100'] },
  { shortcode: '100', emoji: '💯', keywords: ['score', 'perfect', 'hundred'] },
  { shortcode: 'abc', emoji: '🔤', keywords: ['alphabet', 'letters'] },
  { shortcode: 'abcd', emoji: '🔡', keywords: ['alphabet', 'lowercase'] },
  { shortcode: 'capital_abcd', emoji: '🔠', keywords: ['alphabet', 'uppercase'] },
  { shortcode: 'symbols', emoji: '🔣', keywords: ['character', 'input'] },
  { shortcode: 'input_latin_letters', emoji: '🔤', keywords: ['alphabet', 'type'] },
  { shortcode: 'a', emoji: '🅰️', keywords: ['blood', 'letter'] },
  { shortcode: 'b', emoji: '🅱️', keywords: ['blood', 'letter'] },
  { shortcode: 'ab', emoji: '🆎', keywords: ['blood', 'type'] },
  { shortcode: 'cl', emoji: '🆑', keywords: ['clear'] },
  { shortcode: 'cool', emoji: '🆒', keywords: ['word'] },
  { shortcode: 'free', emoji: '🆓', keywords: ['word', 'gratis'] },
  { shortcode: 'id', emoji: '🆔', keywords: ['identity'] },
  { shortcode: 'new', emoji: '🆕', keywords: ['word', 'fresh'] },
  { shortcode: 'ng', emoji: '🆖', keywords: ['word', 'no good'] },
  { shortcode: 'ok', emoji: '🆗', keywords: ['word', 'okay'] },
  { shortcode: 'sos', emoji: '🆘', keywords: ['help', 'emergency'] },
  { shortcode: 'up', emoji: '🆙', keywords: ['word'] },
  { shortcode: 'vs', emoji: '🆚', keywords: ['versus', 'against'] },
  { shortcode: 'arrow_up', emoji: '⬆️', keywords: ['direction', 'north'] },
  { shortcode: 'arrow_down', emoji: '⬇️', keywords: ['direction', 'south'] },
  { shortcode: 'arrow_left', emoji: '⬅️', keywords: ['direction', 'west'] },
  { shortcode: 'arrow_right', emoji: '➡️', keywords: ['direction', 'east'] },
  { shortcode: 'arrow_upper_left', emoji: '↖️', keywords: ['direction'] },
  { shortcode: 'arrow_upper_right', emoji: '↗️', keywords: ['direction'] },
  { shortcode: 'arrow_lower_left', emoji: '↙️', keywords: ['direction'] },
  { shortcode: 'arrow_lower_right', emoji: '↘️', keywords: ['direction'] },
  { shortcode: 'left_right_arrow', emoji: '↔️', keywords: ['direction'] },
  { shortcode: 'up_down_arrow', emoji: '↕️', keywords: ['direction'] },
  { shortcode: 'arrows_counterclockwise', emoji: '🔄', keywords: ['refresh', 'reload'] },
  { shortcode: 'arrows_clockwise', emoji: '🔃', keywords: ['refresh', 'reload'] },
  { shortcode: 'back', emoji: '🔙', keywords: ['arrow', 'return'] },
  { shortcode: 'end', emoji: '🔚', keywords: ['arrow'] },
  { shortcode: 'on', emoji: '🔛', keywords: ['arrow'] },
  { shortcode: 'soon', emoji: '🔜', keywords: ['arrow'] },
  { shortcode: 'top', emoji: '🔝', keywords: ['arrow', 'up'] },
  { shortcode: 'place_of_worship', emoji: '🛐', keywords: ['religion', 'pray'] },
  { shortcode: 'peace', emoji: '☮️', keywords: ['symbol', 'hippie'] },
  { shortcode: 'menorah', emoji: '🕎', keywords: ['religion', 'jewish'] },
  { shortcode: 'six_pointed_star', emoji: '🔯', keywords: ['jewish', 'star'] },
  { shortcode: 'yin_yang', emoji: '☯️', keywords: ['balance', 'asian'] },
  { shortcode: 'latin_cross', emoji: '✝️', keywords: ['religion', 'christian'] },
  { shortcode: 'orthodox_cross', emoji: '☦️', keywords: ['religion'] },
  { shortcode: 'star_and_crescent', emoji: '☪️', keywords: ['religion', 'islam'] },
  { shortcode: 'wheel_of_dharma', emoji: '☸️', keywords: ['religion', 'buddhism'] },
  { shortcode: 'om', emoji: '🕉️', keywords: ['religion', 'hindu'] },
  { shortcode: 'red_circle', emoji: '🔴', keywords: ['shape'] },
  { shortcode: 'orange_circle', emoji: '🟠', keywords: ['shape'] },
  { shortcode: 'yellow_circle', emoji: '🟡', keywords: ['shape'] },
  { shortcode: 'green_circle', emoji: '🟢', keywords: ['shape'] },
  { shortcode: 'blue_circle', emoji: '🔵', keywords: ['shape'] },
  { shortcode: 'purple_circle', emoji: '🟣', keywords: ['shape'] },
  { shortcode: 'brown_circle', emoji: '🟤', keywords: ['shape'] },
  { shortcode: 'black_circle', emoji: '⚫', keywords: ['shape'] },
  { shortcode: 'white_circle', emoji: '⚪', keywords: ['shape'] },
  { shortcode: 'red_square', emoji: '🟥', keywords: ['shape'] },
  { shortcode: 'orange_square', emoji: '🟧', keywords: ['shape'] },
  { shortcode: 'yellow_square', emoji: '🟨', keywords: ['shape'] },
  { shortcode: 'green_square', emoji: '🟩', keywords: ['shape'] },
  { shortcode: 'blue_square', emoji: '🟦', keywords: ['shape'] },
  { shortcode: 'purple_square', emoji: '🟪', keywords: ['shape'] },
  { shortcode: 'brown_square', emoji: '🟫', keywords: ['shape'] },
  { shortcode: 'black_large_square', emoji: '⬛', keywords: ['shape'] },
  { shortcode: 'white_large_square', emoji: '⬜', keywords: ['shape'] },
  { shortcode: 'diamond_shape_with_a_dot_inside', emoji: '💠', keywords: ['symbol'] },
  { shortcode: 'radio_button', emoji: '🔘', keywords: ['circle', 'input'] },
  { shortcode: 'white_square_button', emoji: '🔳', keywords: ['shape'] },
  { shortcode: 'black_square_button', emoji: '🔲', keywords: ['shape'] },

  // Flags (common ones)
  { shortcode: 'flag_white', emoji: '🏳️', keywords: ['surrender'] },
  { shortcode: 'flag_black', emoji: '🏴', keywords: ['pirate'] },
  { shortcode: 'rainbow_flag', emoji: '🏳️‍🌈', keywords: ['pride', 'lgbt'] },
  { shortcode: 'pirate_flag', emoji: '🏴‍☠️', keywords: ['jolly roger'] },
  { shortcode: 'flag_us', emoji: '🇺🇸', keywords: ['usa', 'america'] },
  { shortcode: 'flag_gb', emoji: '🇬🇧', keywords: ['uk', 'britain', 'england'] },
  { shortcode: 'flag_ca', emoji: '🇨🇦', keywords: ['canada'] },
  { shortcode: 'flag_de', emoji: '🇩🇪', keywords: ['germany', 'deutsch'] },
  { shortcode: 'flag_fr', emoji: '🇫🇷', keywords: ['france', 'french'] },
  { shortcode: 'flag_it', emoji: '🇮🇹', keywords: ['italy', 'italian'] },
  { shortcode: 'flag_es', emoji: '🇪🇸', keywords: ['spain', 'spanish'] },
  { shortcode: 'flag_jp', emoji: '🇯🇵', keywords: ['japan', 'japanese'] },
  { shortcode: 'flag_cn', emoji: '🇨🇳', keywords: ['china', 'chinese'] },
  { shortcode: 'flag_kr', emoji: '🇰🇷', keywords: ['korea', 'korean', 'south'] },
  { shortcode: 'flag_in', emoji: '🇮🇳', keywords: ['india', 'indian'] },
  { shortcode: 'flag_br', emoji: '🇧🇷', keywords: ['brazil', 'brazilian'] },
  { shortcode: 'flag_mx', emoji: '🇲🇽', keywords: ['mexico', 'mexican'] },
  { shortcode: 'flag_au', emoji: '🇦🇺', keywords: ['australia', 'aussie'] },
  { shortcode: 'flag_ru', emoji: '🇷🇺', keywords: ['russia', 'russian'] },
  { shortcode: 'checkered_flag', emoji: '🏁', keywords: ['race', 'finish'] },
  { shortcode: 'triangular_flag', emoji: '🚩', keywords: ['red flag', 'warning'] },
];

// Build index for faster lookup
const emojiIndex = new Map<string, EmojiItem[]>();
for (const item of EMOJI_DATA) {
  // Index by shortcode
  if (!emojiIndex.has(item.shortcode)) {
    emojiIndex.set(item.shortcode, []);
  }
  emojiIndex.get(item.shortcode)!.push(item);

  // Index by keywords
  for (const keyword of item.keywords) {
    if (!emojiIndex.has(keyword)) {
      emojiIndex.set(keyword, []);
    }
    emojiIndex.get(keyword)!.push(item);
  }
}

// Fuzzy search for emojis
function fuzzySearchEmoji(query: string): EmojiItem[] {
  if (!query) {
    // Return recently used or popular emojis when no query
    const stored = localStorage.getItem('stoneforge.recentEmojis');
    if (stored) {
      try {
        const recent = JSON.parse(stored) as string[];
        const results = recent
          .map((emoji) => EMOJI_DATA.find((e) => e.emoji === emoji))
          .filter((e): e is EmojiItem => e !== undefined)
          .slice(0, 10);
        if (results.length > 0) return results;
      } catch {
        // Ignore parse errors
      }
    }
    // Default popular emojis
    return EMOJI_DATA.slice(0, 10);
  }

  const lowerQuery = query.toLowerCase();
  const seen = new Set<string>();
  const results: EmojiItem[] = [];

  // Exact matches first
  const exactMatches = emojiIndex.get(lowerQuery) || [];
  for (const item of exactMatches) {
    if (!seen.has(item.emoji)) {
      seen.add(item.emoji);
      results.push(item);
    }
  }

  // Then prefix matches
  for (const item of EMOJI_DATA) {
    if (seen.has(item.emoji)) continue;

    if (item.shortcode.toLowerCase().startsWith(lowerQuery)) {
      seen.add(item.emoji);
      results.push(item);
    } else {
      for (const keyword of item.keywords) {
        if (keyword.startsWith(lowerQuery)) {
          seen.add(item.emoji);
          results.push(item);
          break;
        }
      }
    }
  }

  // Then partial matches
  for (const item of EMOJI_DATA) {
    if (seen.has(item.emoji)) continue;

    if (item.shortcode.toLowerCase().includes(lowerQuery)) {
      seen.add(item.emoji);
      results.push(item);
    } else {
      for (const keyword of item.keywords) {
        if (keyword.includes(lowerQuery)) {
          seen.add(item.emoji);
          results.push(item);
          break;
        }
      }
    }
  }

  return results.slice(0, 20);
}

// Menu component ref interface
export interface EmojiMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

// Menu component props
interface EmojiMenuProps {
  items: EmojiItem[];
  command: (item: EmojiItem) => void;
}

// The menu component that renders the emoji list
export const EmojiMenu = forwardRef<EmojiMenuRef, EmojiMenuProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    },
    [items, command]
  );

  // Expose keyboard handler to Tiptap
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
        return true;
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1));
        return true;
      }

      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }

      if (event.key === 'Escape') {
        return true;
      }

      return false;
    },
  }));

  if (!items.length) {
    return (
      <div
        data-testid="emoji-autocomplete-menu"
        className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 min-w-[200px]"
      >
        <div className="text-sm text-gray-500 dark:text-gray-400">No matching emojis</div>
      </div>
    );
  }

  return (
    <div
      data-testid="emoji-autocomplete-menu"
      className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-1 min-w-[200px] max-h-[240px] overflow-y-auto"
    >
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;

        return (
          <button
            key={`${item.emoji}-${item.shortcode}-${index}`}
            data-testid={`emoji-item-${item.shortcode}`}
            className={`w-full flex items-center gap-3 px-3 py-1.5 rounded text-left transition-colors ${
              isSelected
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              selectItem(index);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span className="text-xl">{item.emoji}</span>
            <span className="text-sm font-mono">:{item.shortcode}:</span>
          </button>
        );
      })}
    </div>
  );
});

EmojiMenu.displayName = 'EmojiMenu';

// Suggestion plugin configuration
function createEmojiSuggestionConfig(): Partial<SuggestionOptions<EmojiItem>> {
  return {
    char: ':',
    startOfLine: false,
    allowSpaces: false,

    items: ({ query }) => {
      return fuzzySearchEmoji(query);
    },

    render: () => {
      let component: ReactRenderer<EmojiMenuRef> | null = null;
      let popup: TippyInstance | null = null;

      return {
        onStart: (props: SuggestionProps<EmojiItem>) => {
          component = new ReactRenderer(EmojiMenu, {
            props: {
              items: props.items,
              command: props.command,
            },
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy(document.body, {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            animation: 'fade',
            zIndex: 9999,
          } as Partial<TippyProps>);
        },

        onUpdate: (props: SuggestionProps<EmojiItem>) => {
          if (component) {
            component.updateProps({
              items: props.items,
              command: props.command,
            });
          }

          if (popup && props.clientRect) {
            popup.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          }
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === 'Escape') {
            popup?.hide();
            return true;
          }

          if (component?.ref) {
            return component.ref.onKeyDown(props);
          }

          return false;
        },

        onExit: () => {
          popup?.destroy();
          component?.destroy();
        },
      };
    },

    command: ({ editor, range, props }) => {
      // Delete the :shortcode: and insert the actual emoji
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent(props.emoji)
        .run();

      // Update recent emojis in localStorage
      const stored = localStorage.getItem('stoneforge.recentEmojis');
      let recent: string[] = [];
      if (stored) {
        try {
          recent = JSON.parse(stored);
        } catch {
          // Ignore parse errors
        }
      }
      recent = [props.emoji, ...recent.filter((e) => e !== props.emoji)].slice(0, 20);
      localStorage.setItem('stoneforge.recentEmojis', JSON.stringify(recent));
    },
  };
}

// Unique plugin key for emoji suggestion (distinct from slash commands)
const emojiSuggestionPluginKey = new PluginKey('emojiSuggestion');

// The main emoji autocomplete extension
export const EmojiAutocomplete = Extension.create({
  name: 'emojiAutocomplete',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: emojiSuggestionPluginKey,
        ...createEmojiSuggestionConfig(),
      }),
    ];
  },
});

export default EmojiAutocomplete;
