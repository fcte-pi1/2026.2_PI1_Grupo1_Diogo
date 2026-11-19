"""Bloco H: hardware, com o robô apoiado e as rodas no ar."""

from functools import partial

from ..checks.sensors import (check_encoders, check_firmware_diagnostic, check_gyro_series, check_health,
                              check_motor, check_tof_monitor, check_wheels)
from ..model import Step, Test, repeated
from ..workspace import ROBOT_TESTS_DIR
from .instructions import DO_NOT_TOUCH, SUPPORTED

TOF_MONITOR_END = r"tofmon fim: "

HARDWARE_TESTS: tuple[Test, ...] = (
    Test("H1", "Diagnóstico geral do hardware",
         (SUPPORTED, "Robô parado e imóvel.", DO_NOT_TOUCH + " O teste leva ~8 s."),
         (Step("diag", r"diag: fim: ", timeout=30),),
         "A última linha é 'diag: fim: OK'. A data e a hora de compilação do firmware são as de hoje.",
         partial(check_firmware_diagnostic, firmware_dir=ROBOT_TESTS_DIR.parent)),
    Test("H2", "ToF parados por 30 s",
         (SUPPORTED, DO_NOT_TOUCH + " O teste leva 30 s."),
         (Step("tofmon 30", TOF_MONITOR_END, timeout=50),),
         "Nenhuma leitura em falha nos três sensores.",
         check_tof_monitor),
    Test("H4", "Giroscópio parado por 3 minutos, logo depois de ligar",
         ("ANTES deste teste: desligue a bateria do robô, espere 10 s, ligue de novo e espere a janela da "
          "ponte mostrar '[ble] conectado'. Rode este teste em seguida (em menos de 1 minuto).",
          "Robô APOIADO numa mesa firme, que ninguém esbarre. NÃO segure na mão.",
          DO_NOT_TOUCH + " O teste leva 3 minutos (7 leituras, uma a cada 30 s)."),
         repeated(Step("giro", r"giroscopio em repouso: ", timeout=15, gap=30.0), 7),
         "Em cada leitura, a diferença entre máximo e mínimo fica abaixo de 3 graus/s e nenhuma leitura se "
         "perde. O valor médio pode ser diferente de zero (o firmware desconta).",
         check_gyro_series),
    Test("H5", "Encoders, girando as rodas à mão",
         (SUPPORTED,
          "Faça com uma caneta uma marca no pneu de CADA roda, na parte de cima.",
          "Depois do ok você tem 25 s. Gire a roda ESQUERDA (a da esquerda de quem olha o robô por trás) "
          "exatamente UMA volta para a FRENTE: a parte de cima da roda vai em direção à frente do robô. "
          "Pare quando a marca voltar ao topo.",
          "Em seguida gire a roda DIREITA exatamente UMA volta para a FRENTE.",
          "Gire devagar (uns 3 s por volta). Não gire para trás."),
         (Step("enc 25", r"enc fim: ", timeout=40),),
         "Cada roda conta entre 225 e 345 pulsos (uma volta = 285).",
         check_encoders),
    Test("H6", "Cada roda sozinha, nos dois sentidos",
         (SUPPORTED, "As rodas VÃO GIRAR sozinhas por ~15 s. Mantenha dedos, cabos e roupas longe delas.",
          "Confira que nada encosta nos pneus (fios, chassi, suporte)."),
         (Step("rodas", r"rodas: resumo: ", timeout=60),),
         "A linha 'rodas: resumo' termina em '-> OK': as duas rodas partem com tensão parecida, giram com "
         "velocidade parecida e os encoders contam no sentido certo.",
         check_wheels, moves=True),
    Test("H7", "As duas rodas a 6 V (a bateria aguenta?)",
         (SUPPORTED, "As rodas VÃO GIRAR rápido por 1,5 s. Mantenha tudo longe delas."),
         (Step("motor ed 6 1500", r"motor fim: ", timeout=15),),
         "O robô não reinicia e a bateria não cai abaixo de 6,5 V.",
         check_motor, moves=True),
    Test("H8", "Contadores de erro depois do bloco H",
         (SUPPORTED, "Só leitura: nada se mexe."),
         (Step("saude", r"saude 2/2: ", timeout=10),),
         "Todos os contadores em zero: nenhum erro de I2C, nenhuma queda de sensor, nada perdido no "
         "Bluetooth.",
         check_health),
)
