#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdio>

namespace micromouse::domain {

// Vigia de temperatura e corrente (23/11): procura sinais de curto ou de sobrecarga pela temperatura do chip
// da ESP32-S3 (sensor interno), pela do MPU6050 (outro ponto da placa) e pela corrente do INA219. Só
// DETECTA: quem usa decide o que fazer (hoje, só registrar no log).
//
// O sensor interno mede o próprio chip: um curto longe dele (motor, ponte H, ToF) aquece o ponto do curto
// e chega ao chip devagar, se chegar. O sinal rápido para um curto é a corrente. Os limites abaixo são uma
// PROPOSTA a confirmar na pista (no robô parado, em 23/11: ESP ~45-50 C, MPU 48,5 C, corrente ~0,1 A).
inline constexpr double kThermalRiseC = 3.0;        // subida que conta como súbita...
inline constexpr double kThermalRiseWindowS = 10.0;  // ...dentro desta janela
inline constexpr double kEspMaxC = 75.0;             // ESP32-S3: o sensor vai até ~80 C na faixa padrão
inline constexpr double kImuMaxC = 70.0;
inline constexpr double kCurrentMaxA = 1.5;          // A CONFIRMAR: o pico de partida e a roda travada
inline constexpr double kCurrentHoldS = 0.5;         // acima do limite por este tempo (ignora o pico de partida)

// Alarmes, como bits.
inline constexpr std::uint32_t kAlarmEspRise = 1u << 0;
inline constexpr std::uint32_t kAlarmEspHot = 1u << 1;
inline constexpr std::uint32_t kAlarmImuRise = 1u << 2;
inline constexpr std::uint32_t kAlarmImuHot = 1u << 3;
inline constexpr std::uint32_t kAlarmCurrent = 1u << 4;

// Os nomes dos alarmes em `bits`, separados por vírgula, para o log ("ESP subindo, corrente alta"; "nenhum" se 0).
inline void describeThermalAlarms(std::uint32_t bits, char* out, std::size_t size) noexcept {
    if (size == 0) return;
    out[0] = '\0';
    static constexpr struct {
        std::uint32_t bit;
        const char* name;
    } kNames[] = {{kAlarmEspRise, "ESP subindo"}, {kAlarmEspHot, "ESP quente"}, {kAlarmImuRise, "MPU subindo"},
                  {kAlarmImuHot, "MPU quente"}, {kAlarmCurrent, "corrente alta"}};
    std::size_t used = 0;
    for (const auto& entry : kNames) {
        if ((bits & entry.bit) == 0 || used >= size) continue;
        const int written = std::snprintf(out + used, size - used, "%s%s", used > 0 ? ", " : "", entry.name);
        if (written < 0) break;
        used += static_cast<std::size_t>(written);
    }
    if (out[0] == '\0') std::snprintf(out, size, "nenhum");
}

// Uma amostra; cada sinal com o seu "válido" (sensor que não respondeu fica de fora).
struct ThermalSample {
    double timeS{0.0};
    double espC{0.0};
    bool espValid{false};
    double imuC{0.0};
    bool imuValid{false};
    double currentA{0.0};
    bool currentValid{false};
};

struct ThermalReport {
    std::uint32_t active{0};   // alarmes valendo agora
    std::uint32_t raised{0};   // os que começaram nesta amostra (para o log avisar uma vez)
    std::uint32_t cleared{0};  // os que acabaram nesta amostra
    double espRiseC{0.0};      // subida na janela (amostra atual menos a menor da janela)
    double imuRiseC{0.0};
    double currentA{0.0};
};

class ThermalWatch {
public:
    ThermalReport add(const ThermalSample& sample) noexcept {
        ThermalReport report;
        std::uint32_t active = 0;
        if (sample.espValid) {
            report.espRiseC = esp_.add(sample.timeS, sample.espC);
            if (report.espRiseC >= kThermalRiseC) active |= kAlarmEspRise;
            if (sample.espC > kEspMaxC) active |= kAlarmEspHot;
        } else {
            active |= active_ & (kAlarmEspRise | kAlarmEspHot);  // sem leitura, mantém o que estava
        }
        if (sample.imuValid) {
            report.imuRiseC = imu_.add(sample.timeS, sample.imuC);
            if (report.imuRiseC >= kThermalRiseC) active |= kAlarmImuRise;
            if (sample.imuC > kImuMaxC) active |= kAlarmImuHot;
        } else {
            active |= active_ & (kAlarmImuRise | kAlarmImuHot);
        }
        if (sample.currentValid) {
            report.currentA = sample.currentA;
            if (sample.currentA > kCurrentMaxA) {
                if (!overCurrent_) {
                    overCurrent_ = true;
                    overCurrentSinceS_ = sample.timeS;
                }
                if (sample.timeS - overCurrentSinceS_ >= kCurrentHoldS) active |= kAlarmCurrent;
            } else {
                overCurrent_ = false;
            }
        } else {
            active |= active_ & kAlarmCurrent;
        }
        report.active = active;
        report.raised = active & ~active_;
        report.cleared = active_ & ~active;
        active_ = active;
        return report;
    }

private:
    // As últimas leituras de um sinal; devolve a subida em relação à menor dentro da janela.
    class Window {
    public:
        double add(double timeS, double value) noexcept {
            times_[next_] = timeS;
            values_[next_] = value;
            next_ = (next_ + 1) % kSize;
            count_ = std::min(count_ + 1, kSize);
            double lowest = value;
            for (std::size_t i = 0; i < count_; ++i) {
                if (timeS - times_[i] <= kThermalRiseWindowS) lowest = std::min(lowest, values_[i]);
            }
            return value - lowest;
        }

    private:
        static constexpr std::size_t kSize = 64;  // 1 amostra/s cobre a janela com folga
        std::array<double, kSize> times_{};
        std::array<double, kSize> values_{};
        std::size_t next_{0};
        std::size_t count_{0};
    };

    Window esp_;
    Window imu_;
    bool overCurrent_{false};
    double overCurrentSinceS_{0.0};
    std::uint32_t active_{0};
};

}  // namespace micromouse::domain
